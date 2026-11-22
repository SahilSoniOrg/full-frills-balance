import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { AuditAction, InboxProcessingStatus } from '@/src/types/enums';
import type { AuditEventType } from '@/src/types/auditEvents';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  inboxAuditState,
  mergeInboxAuditState,
  sameInboxAuditState,
} from '@/src/data/repositories/inboxAuditState';
import {
  runAccountingWriteSession,
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { Model, Q } from '@nozbe/watermelondb';
import {
  deviceSmsInboxRepository,
  type DeviceSmsWriteOptions,
} from '@/src/data/repositories/DeviceSmsInboxRepository';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import { generator } from '@/src/utils/idGenerator';
import { sanitizeSmsMetadataJson } from '@/src/domain/transaction-intelligence/smsPrivateMetadata';
import { parseJSONRecord } from '@/src/utils/serialization';
import { applyInboxWriteData } from '@/src/data/repositories/inboxRecordFields';
import {
  stageLinkedCaptureSource,
  stageUnlinkedCaptureSource,
} from '@/src/data/repositories/journal/captureSourceLinkStaging';
import {
  copiesForSourceIds,
  findInboxRecord,
  inboxCollection,
  isProcessedStatus,
} from './inboxProjection';

export interface InboxAuditContext {
  correlationId?: string;
}

const stagedCopies = new WeakMap<
  AccountingWriteSession,
  Map<
    string,
    {
      data: TransactionInboxRecordWriteData;
      existing: TransactionInboxRecord | null;
      audit?: InboxAuditContext;
    }
  >
>();

function withoutDuplicateReasons(metadataJson: string | null | undefined): string | undefined {
  const metadata = parseJSONRecord(metadataJson);
  if (!('duplicateReasons' in metadata)) return metadataJson ?? undefined;
  delete metadata.duplicateReasons;
  return Object.keys(metadata).length ? JSON.stringify(metadata) : undefined;
}

function clearDuplicateIfAlreadyLinked(
  data: TransactionInboxRecordWriteData,
): TransactionInboxRecordWriteData {
  if (!data.linkedJournalId || data.duplicateJournalId !== data.linkedJournalId) return data;

  return {
    ...data,
    duplicateJournalId: undefined,
    duplicateConfidence: undefined,
    metadataJson: withoutDuplicateReasons(data.metadataJson),
  };
}

export function prepareInboxLink(
  record: TransactionInboxRecord,
  journalId: JournalId,
  disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
): Model {
  return record.prepareUpdate(entry => {
    const duplicateJournalId = entry.duplicateJournalId;
    entry.linkedJournalId = journalId;
    entry.processingStatus = disposition;
    entry.processedAt = Date.now();
    if (duplicateJournalId !== journalId) return;
    entry.duplicateJournalId = undefined;
    entry.duplicateConfidence = undefined;
    entry.metadataJson = withoutDuplicateReasons(entry.metadataJson);
  });
}

export function prepareInboxUnlink(record: TransactionInboxRecord): Model {
  return record.prepareUpdate(entry => {
    entry.linkedJournalId = undefined;
    entry.processingStatus = InboxProcessingStatus.PENDING;
    entry.processedAt = undefined;
  });
}

export function prepareInboxStatus(
  record: TransactionInboxRecord,
  status: InboxProcessingStatus,
): Model {
  return record.prepareUpdate(entry => {
    entry.processingStatus = status;
    entry.processedAt = isProcessedStatus(status) ? Date.now() : undefined;
  });
}

export function prepareInboxUpsert(
  data: TransactionInboxRecordWriteData,
  existingRecord: TransactionInboxRecord | null,
  auditContext?: InboxAuditContext,
): { ops: Model[]; record: TransactionInboxRecord } {
  if (existingRecord && existingRecord.workplaceId !== data.workplaceId) {
    throw new Error('Inbox record does not belong to the specified workplace');
  }

  const writeData = clearDuplicateIfAlreadyLinked(data);
  const safeData: TransactionInboxRecordWriteData = {
    ...writeData,
    processedAt: isProcessedStatus(writeData.processingStatus)
      ? (writeData.processedAt ?? Date.now())
      : undefined,
    metadataJson: sanitizeSmsMetadataJson(writeData.metadataJson, writeData.channel === 'sms'),
  };

  if (existingRecord) {
    const before = inboxAuditState(existingRecord);
    const after = mergeInboxAuditState(existingRecord, safeData);
    return {
      ops: [
        existingRecord.prepareUpdate(record => {
          applyInboxWriteData(record, safeData);
        }),
        ...(!sameInboxAuditState(before, after)
          ? [
              prepareInboxAudit(
                existingRecord.id,
                AuditAction.UPDATE,
                'transaction_inbox_record.updated',
                before,
                after,
                safeData.workplaceId,
                'system',
                auditContext?.correlationId,
              ),
            ]
          : []),
      ],
      record: existingRecord,
    };
  }

  const record = inboxCollection().prepareCreate((entry: TransactionInboxRecord) => {
    applyInboxWriteData(entry, safeData);
  });
  return {
    ops: [
      record,
      prepareInboxAudit(
        record.id,
        AuditAction.CREATE,
        'transaction_inbox_record.created',
        undefined,
        inboxAuditState(safeData),
        safeData.workplaceId,
        'system',
        auditContext?.correlationId,
      ),
    ],
    record,
  };
}

function prepareInboxAudit(
  entityId: string,
  action: AuditAction,
  eventType: AuditEventType,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  workplaceId: WorkplaceId,
  source: 'app' | 'system',
  correlationId?: string,
): Model {
  return auditRepository.prepareLog(
    {
      entityType: 'transaction_inbox_record',
      entityId,
      action,
      eventType,
      source,
      correlationId,
      undoable: false,
      changes: before ? { before, after } : { after },
    },
    workplaceId,
  );
}

/** Device capture and optional Workplace consumption share the journal's atomic write. */
export async function stageInboxUpsertInSession(
  session: AccountingWriteSession,
  data: TransactionInboxRecordWriteData,
  _existingRecord: InboxRecordSnapshot | null,
  auditContext?: InboxAuditContext,
  options: DeviceSmsWriteOptions = { origin: 'manual', skipReview: false },
): Promise<void> {
  const writeData = clearDuplicateIfAlreadyLinked(data);
  const device = await deviceSmsInboxRepository.stageUpsert(
    session,
    {
      ...writeData,
      deviceInboxId: writeData.deviceInboxId ?? _existingRecord?.id ?? generator(),
    },
    options,
  );
  const copies = await copiesForSourceIds([device.deviceSourceId]);
  const existing = copies.find(copy => copy.workplaceId === writeData.workplaceId) ?? null;
  if (isProcessedStatus(writeData.processingStatus) || existing) {
    let writes = stagedCopies.get(session);
    if (!writes) {
      writes = new Map();
      stagedCopies.set(session, writes);
    }
    const key = `${writeData.workplaceId}:${device.id}`;
    const safeData = {
      ...writeData,
      // Source content belongs to the Device record. Preserve pre-existing
      // legacy copies, but do not duplicate new captures into workplaces.
      senderAddress: existing?.senderAddress,
      rawBody: existing?.rawBody,
      deviceSourceId: device.deviceSourceId,
      deviceInboxId: device.id,
      inputDate: device.inputDate,
      processingStatus:
        existing?.linkedJournalId && existing.linkedJournalId === writeData.linkedJournalId
          ? existing.processingStatus
          : writeData.processingStatus,
    };
    const staged = writes.get(key);
    if (staged) staged.data = safeData;
    else {
      const write = { data: safeData, existing, audit: auditContext };
      writes.set(key, write);
      stageModelWrite(
        session,
        () => prepareInboxUpsert(write.data, write.existing, write.audit).ops,
      );
    }
  }
}

export async function stageInboxLinkByIdInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  recordId: string,
  journalId: JournalId,
  disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  auditContext?: InboxAuditContext,
): Promise<void> {
  const record = await findInboxRecord(workplaceId, recordId);
  if (!record) throw new Error('Inbox record not found');
  if (record.linkedJournalId && record.linkedJournalId !== journalId)
    throw new Error('This source is already linked to another transaction');
  await stageLinkedCaptureSource(session, workplaceId, journalId, {
    channel: record.channel,
    sourceId: record.deviceSourceId,
    occurredAt: record.inputDate,
    fingerprint: record.inputFingerprint,
    merchant: record.parsedMerchant,
  });
  if (record.channel !== 'sms') {
    const model = await inboxCollection().find(record.id);
    stageModelWrite(session, () => [prepareInboxLink(model, journalId, disposition)]);
    return;
  }
  await stageInboxUpsertInSession(
    session,
    {
      ...record,
      channel: 'sms',
      linkedJournalId: journalId,
      processingStatus: disposition,
      lastScannedAt: Date.now(),
    },
    record,
    auditContext,
  );
}

export async function persistInboxLink(
  workplaceId: WorkplaceId,
  recordId: string,
  journalId: JournalId,
  disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
): Promise<void> {
  await runAccountingWriteSession(async session => {
    if (await findInboxRecord(workplaceId, recordId))
      await stageInboxLinkByIdInSession(session, workplaceId, recordId, journalId, disposition);
  });
}

export async function persistInboxUnlink(workplaceId: WorkplaceId, recordId: string): Promise<void> {
  await runAccountingWriteSession(async session => {
    const record = await findInboxRecord(workplaceId, recordId);
    if (!record) throw new Error('Inbox record not found');
    if (!record.linkedJournalId) throw new Error('This source is not linked to a journal');
    const journalId = record.linkedJournalId;
    await stageUnlinkedCaptureSource(session, workplaceId, journalId, {
      channel: record.channel,
      sourceId: record.deviceSourceId,
    });

    let model: TransactionInboxRecord | null = null;
    if (record.channel === 'sms') {
      const copies = await copiesForSourceIds([record.deviceSourceId]);
      model = copies.find(copy => copy.workplaceId === workplaceId) ?? null;
    } else {
      const rows = await inboxCollection()
        .query(Q.where('id', record.id), Q.where('workplace_id', workplaceId))
        .fetch();
      model = rows[0] ?? null;
    }
    if (!model) throw new Error('Inbox record not found');
    stageModelWrite(session, () => [prepareInboxUnlink(model)]);
  });
}

export async function persistInboxStatus(
  workplaceId: WorkplaceId,
  recordId: string,
  status: InboxProcessingStatus,
): Promise<void> {
  await runAccountingWriteSession(async session => {
    const record = await findInboxRecord(workplaceId, recordId);
    if (!record) return;
    if (record.linkedJournalId && status !== record.processingStatus)
      throw new Error('A linked observation cannot be returned to the pending inbox');
    if (record.channel !== 'sms') {
      const model = await inboxCollection().find(record.id);
      stageModelWrite(session, () => [prepareInboxStatus(model, status)]);
      return;
    }
    await stageInboxUpsertInSession(
      session,
      { ...record, channel: 'sms', processingStatus: status, lastScannedAt: Date.now() },
      record,
    );
  });
}
