import { database } from '@/src/data/database/Database';
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
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { Model, Q } from '@nozbe/watermelondb';
import { Observable, combineLatest, map } from 'rxjs';
import {
  deviceSmsInboxRepository,
  deviceSmsSnapshot,
  type DeviceSmsWriteOptions,
} from './DeviceSmsInboxRepository';
import { workplaceRepository } from './WorkplaceRepository';
import type DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import { runAccountingWriteSession } from './AccountingWriteSession';
import { generator } from '@/src/data/database/idGenerator';
import { sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';
import {
  applyInboxWriteData,
  inboxSnapshotFromRecord,
} from '@/src/data/repositories/inboxRecordFields';

interface InboxAuditContext {
  correlationId?: string;
}

function isProcessedStatus(status: InboxProcessingStatus): boolean {
  return (
    status === InboxProcessingStatus.IMPORTED ||
    status === InboxProcessingStatus.AUTO_POSTED ||
    status === InboxProcessingStatus.DISMISSED
  );
}

export class TransactionInboxRepository {
  private readonly stagedCopies = new WeakMap<
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
  private get inbox() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  }

  private project(
    workplaceId: WorkplaceId,
    devices: DeviceSmsInboxRecord[],
    copies: TransactionInboxRecord[],
    names: ReadonlyMap<WorkplaceId, string> = new Map(),
  ): InboxRecordSnapshot[] {
    const sourceIds = new Set(devices.map(record => record.deviceSourceId));
    const copiesBySource = new Map<string, TransactionInboxRecord[]>();
    for (const copy of copies) {
      const group = copiesBySource.get(copy.deviceSourceId) ?? [];
      group.push(copy);
      copiesBySource.set(copy.deviceSourceId, group);
    }
    return [
      ...devices.map(device => {
        const consumed = copiesBySource.get(device.deviceSourceId) ?? [];
        const local = consumed.find(copy => copy.workplaceId === workplaceId);
        return {
          ...(local ? inboxSnapshotFromRecord(local) : deviceSmsSnapshot(device, workplaceId)),
          senderAddress: local?.senderAddress ?? device.senderAddress,
          rawBody: local?.rawBody ?? device.rawBody,
          id: device.id,
          deviceInboxId: device.id,
          consumedWorkplaces: consumed
            .filter(
              copy => copy.workplaceId !== workplaceId && isProcessedStatus(copy.processingStatus),
            )
            .map(copy => ({
              workplaceId: copy.workplaceId,
              name: names.get(copy.workplaceId) ?? 'Another workplace',
            })),
        };
      }),
      ...copies
        .filter(copy => copy.workplaceId === workplaceId && !sourceIds.has(copy.deviceSourceId))
        .map(copy => inboxSnapshotFromRecord(copy)),
    ].sort((a, b) => b.inputDate - a.inputDate);
  }

  private async copiesForSourceIds(sourceIds: string[]): Promise<TransactionInboxRecord[]> {
    if (!sourceIds.length) return [];
    return this.inbox
      .query(Q.where('channel', 'sms'), Q.where('device_source_id', Q.oneOf(sourceIds)))
      .fetch();
  }

  async find(workplaceId: WorkplaceId, id: string): Promise<InboxRecordSnapshot | null> {
    const device = await deviceSmsInboxRepository.find(id);
    if (device)
      return this.project(
        workplaceId,
        [device],
        await this.copiesForSourceIds([device.deviceSourceId]),
      )[0];
    const records = await this.inbox
      .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
      .fetch();
    return records[0] ? inboxSnapshotFromRecord(records[0]) : null;
  }

  async findByDeviceSourceIds(
    workplaceId: WorkplaceId,
    deviceSourceIds: string[],
  ): Promise<InboxRecordSnapshot[]> {
    if (!deviceSourceIds.length) return [];
    const [devices, copies] = await Promise.all([
      deviceSmsInboxRepository.findBySourceIds(deviceSourceIds),
      this.copiesForSourceIds(deviceSourceIds),
    ]);
    const canonicalCopies = devices.length
      ? await this.copiesForSourceIds(devices.map(device => device.deviceSourceId))
      : [];
    return this.project(workplaceId, devices, [
      ...new Map([...copies, ...canonicalCopies].map(copy => [copy.id, copy])).values(),
    ]);
  }

  async findMatchingSms(
    workplaceId: WorkplaceId,
    data: TransactionInboxRecordWriteData,
  ): Promise<InboxRecordSnapshot | null> {
    const device = await deviceSmsInboxRepository.findMatch(data);
    return device ? this.find(workplaceId, device.id) : null;
  }

  async findAllByLinkedJournalId(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<InboxRecordSnapshot[]> {
    const copies = await this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('linked_journal_id', journalId),
        Q.where('channel', 'sms'),
        Q.sortBy('input_date', Q.asc),
      )
      .fetch();
    const devices = await deviceSmsInboxRepository.findBySourceIds(
      copies.map(copy => copy.deviceSourceId),
    );
    return this.project(workplaceId, devices, copies).sort((a, b) => a.inputDate - b.inputDate);
  }

  observeInbox(
    workplaceId: WorkplaceId,
    limit: number,
    statuses?: InboxProcessingStatus[],
  ): Observable<InboxRecordSnapshot[]> {
    return combineLatest([
      deviceSmsInboxRepository.observe(),
      this.inbox
        .query(Q.where('channel', 'sms'))
        .observeWithColumns([
          'processing_status',
          'linked_journal_id',
          'duplicate_journal_id',
          'duplicate_confidence',
          'last_scanned_at',
        ]),
      workplaceRepository.observeAll(),
    ]).pipe(
      map(([devices, copies, workplaces]) =>
        this.project(
          workplaceId,
          devices,
          copies,
          new Map(workplaces.map(workplace => [workplace.id, workplace.name])),
        )
          .filter(record => !statuses?.length || statuses.includes(record.processingStatus))
          .slice(0, limit),
      ),
    );
  }

  observeConsumptionChanges() {
    return this.inbox
      .query(Q.where('channel', 'sms'))
      .observeWithColumns(['processing_status', 'linked_journal_id', 'last_scanned_at']);
  }

  observePendingCount(workplaceId: WorkplaceId): Observable<number> {
    return this.observeInbox(workplaceId, Number.MAX_SAFE_INTEGER, [
      InboxProcessingStatus.PENDING,
    ]).pipe(map(records => records.length));
  }

  async findRecentSms(workplaceId: WorkplaceId, limit: number): Promise<InboxRecordSnapshot[]> {
    const [devices, copies] = await Promise.all([
      deviceSmsInboxRepository.findRecent(limit),
      this.inbox
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('channel', 'sms'),
          Q.sortBy('input_date', Q.desc),
          Q.take(limit),
        )
        .fetch(),
    ]);
    return this.project(workplaceId, devices, copies).slice(0, limit);
  }

  async findRecentLinkedProcessed(
    workplaceId: WorkplaceId,
    limit: number,
  ): Promise<TransactionInboxRecord[]> {
    return this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.where('linked_journal_id', Q.notEq(null)),
        Q.where(
          'processing_status',
          Q.oneOf([InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED]),
        ),
        Q.sortBy('input_date', Q.desc),
        Q.take(limit),
      )
      .fetch();
  }

  prepareLink(
    record: TransactionInboxRecord,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Model {
    return record.prepareUpdate(entry => {
      entry.linkedJournalId = journalId;
      entry.processingStatus = disposition;
      entry.processedAt = Date.now();
    });
  }

  prepareStatus(record: TransactionInboxRecord, status: InboxProcessingStatus): Model {
    return record.prepareUpdate(entry => {
      entry.processingStatus = status;
      entry.processedAt = isProcessedStatus(status) ? Date.now() : undefined;
    });
  }

  prepareUpsert(
    data: TransactionInboxRecordWriteData,
    existingRecord: TransactionInboxRecord | null,
    auditContext?: InboxAuditContext,
  ): { ops: Model[]; record: TransactionInboxRecord } {
    if (existingRecord && existingRecord.workplaceId !== data.workplaceId) {
      throw new Error('Inbox record does not belong to the specified workplace');
    }

    const safeData: TransactionInboxRecordWriteData = {
      ...data,
      processedAt: isProcessedStatus(data.processingStatus)
        ? (data.processedAt ?? Date.now())
        : undefined,
      metadataJson: sanitizeSmsMetadataJson(data.metadataJson, data.channel === 'sms'),
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
                this.prepareAudit(
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

    const record = this.inbox.prepareCreate((entry: TransactionInboxRecord) => {
      applyInboxWriteData(entry, safeData);
    });
    return {
      ops: [
        record,
        this.prepareAudit(
          record.id,
          AuditAction.CREATE,
          'transaction_inbox_record.created',
          undefined,
          inboxAuditState(data),
          safeData.workplaceId,
          'system',
          auditContext?.correlationId,
        ),
      ],
      record,
    };
  }

  private prepareAudit(
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
  async stageUpsertInSession(
    session: AccountingWriteSession,
    data: TransactionInboxRecordWriteData,
    _existingRecord: InboxRecordSnapshot | null,
    auditContext?: InboxAuditContext,
    options: DeviceSmsWriteOptions = { origin: 'manual', queueReview: false },
  ): Promise<void> {
    const device = await deviceSmsInboxRepository.stageUpsert(
      session,
      { ...data, deviceInboxId: data.deviceInboxId ?? _existingRecord?.id ?? generator() },
      options,
    );
    const copies = await this.copiesForSourceIds([device.deviceSourceId]);
    const existing = copies.find(copy => copy.workplaceId === data.workplaceId) ?? null;
    if (isProcessedStatus(data.processingStatus) || existing) {
      let writes = this.stagedCopies.get(session);
      if (!writes) {
        writes = new Map();
        this.stagedCopies.set(session, writes);
      }
      const key = `${data.workplaceId}:${device.id}`;
      const safeData = {
        ...data,
        // Source content belongs to the Device record. Preserve pre-existing
        // legacy copies, but do not duplicate new captures into workplaces.
        senderAddress: existing?.senderAddress,
        rawBody: existing?.rawBody,
        deviceSourceId: device.deviceSourceId,
        deviceInboxId: device.id,
        inputDate: device.inputDate,
        processingStatus:
          existing?.linkedJournalId && existing.linkedJournalId === data.linkedJournalId
            ? existing.processingStatus
            : data.processingStatus,
      };
      const staged = writes.get(key);
      if (staged) staged.data = safeData;
      else {
        const write = { data: safeData, existing, audit: auditContext };
        writes.set(key, write);
        stageModelWrite(
          session,
          () => this.prepareUpsert(write.data, write.existing, write.audit).ops,
        );
      }
    }
  }

  async stageLinkByIdInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
    auditContext?: InboxAuditContext,
  ): Promise<void> {
    const record = await this.find(workplaceId, recordId);
    if (!record) throw new Error('Inbox record not found');
    if (record.channel !== 'sms') {
      const model = await this.inbox.find(record.id);
      stageModelWrite(session, () => [this.prepareLink(model, journalId, disposition)]);
      return;
    }
    if (record.linkedJournalId && record.linkedJournalId !== journalId)
      throw new Error('This SMS is already linked to another transaction');
    await this.stageUpsertInSession(
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

  async persistLink(
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Promise<void> {
    await runAccountingWriteSession(async session => {
      if (await this.find(workplaceId, recordId))
        await this.stageLinkByIdInSession(session, workplaceId, recordId, journalId, disposition);
    });
  }

  async persistStatus(
    workplaceId: WorkplaceId,
    recordId: string,
    status: InboxProcessingStatus,
  ): Promise<void> {
    await runAccountingWriteSession(async session => {
      const record = await this.find(workplaceId, recordId);
      if (!record) return;
      if (record.channel !== 'sms') {
        const model = await this.inbox.find(record.id);
        stageModelWrite(session, () => [this.prepareStatus(model, status)]);
        return;
      }
      if (record.linkedJournalId && status !== record.processingStatus)
        throw new Error('A linked SMS cannot be returned to the pending inbox');
      await this.stageUpsertInSession(
        session,
        { ...record, channel: 'sms', processingStatus: status, lastScannedAt: Date.now() },
        record,
      );
    });
  }
}

export const transactionInboxRepository = new TransactionInboxRepository();
