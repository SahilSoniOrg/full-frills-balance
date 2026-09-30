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
import { persistBatch } from '@/src/data/repositories/persistBatch';
import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { Model, Q } from '@nozbe/watermelondb';
import { Observable } from 'rxjs';
import { sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';

export interface TransactionInboxRecordWriteData {
  workplaceId: WorkplaceId;
  channel: 'sms';
  deviceSourceId: string;
  senderAddress?: string;
  rawBody?: string;
  inputDate: number;
  inputFingerprint: string;
  parseStatus: TransactionInboxRecord['parseStatus'];
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  parsedMerchant?: string;
  parsedAccountSource?: string;
  referenceNumber?: string;
  direction: TransactionInboxRecord['direction'];
  processingStatus: InboxProcessingStatus;
  linkedJournalId?: JournalId;
  duplicateJournalId?: JournalId;
  duplicateConfidence?: number;
  metadataJson?: string;
  firstSeenAt: number;
  lastScannedAt: number;
}

export interface InboxAuditContext {
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
  private get inbox() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  }

  async find(workplaceId: WorkplaceId, id: string): Promise<TransactionInboxRecord | null> {
    const records = await this.inbox
      .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
      .fetch();
    return records[0] ?? null;
  }

  async findByDeviceSourceIds(
    workplaceId: WorkplaceId,
    deviceSourceIds: string[],
  ): Promise<TransactionInboxRecord[]> {
    if (deviceSourceIds.length === 0) return [];
    return this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.where('device_source_id', Q.oneOf(deviceSourceIds)),
      )
      .fetch();
  }

  async findAllByLinkedJournalId(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<TransactionInboxRecord[]> {
    return this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('linked_journal_id', journalId),
        Q.where('channel', 'sms'),
        Q.sortBy('input_date', Q.asc),
      )
      .fetch();
  }

  observeInbox(
    workplaceId: WorkplaceId,
    limit: number,
    statuses?: InboxProcessingStatus[],
  ): Observable<TransactionInboxRecord[]> {
    const clauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.where('channel', 'sms'),
      Q.sortBy('input_date', Q.desc),
      Q.take(limit),
    ];
    if (statuses && statuses.length > 0) {
      clauses.unshift(Q.where('processing_status', Q.oneOf(statuses)));
    }
    return this.inbox
      .query(...clauses)
      .observeWithColumns([
        'processing_status',
        'parse_status',
        'parsed_amount',
        'parsed_currency_code',
        'parsed_merchant',
        'linked_journal_id',
        'duplicate_journal_id',
        'duplicate_confidence',
        'parse_confidence',
        'parse_reason',
        'processed_at',
        'input_date',
      ]);
  }

  observePendingCount(workplaceId: WorkplaceId): Observable<number> {
    return this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.where('processing_status', InboxProcessingStatus.PENDING),
      )
      .observeCount();
  }

  async findRecentSms(workplaceId: WorkplaceId, limit: number): Promise<TransactionInboxRecord[]> {
    return this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.sortBy('input_date', Q.desc),
        Q.take(limit),
      )
      .fetch();
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
      entry.senderAddress = undefined;
      entry.rawBody = undefined;
      entry.metadataJson = sanitizeSmsMetadataJson(entry.metadataJson, true);
    });
  }

  prepareStatus(record: TransactionInboxRecord, status: InboxProcessingStatus): Model {
    return record.prepareUpdate(entry => {
      entry.processingStatus = status;
      entry.processedAt = isProcessedStatus(status) ? Date.now() : undefined;
      if (isProcessedStatus(status)) {
        entry.senderAddress = undefined;
        entry.rawBody = undefined;
        entry.metadataJson = sanitizeSmsMetadataJson(entry.metadataJson, true);
      }
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
      ...(isProcessedStatus(data.processingStatus)
        ? { senderAddress: undefined, rawBody: undefined }
        : {}),
      metadataJson: sanitizeSmsMetadataJson(data.metadataJson, data.channel === 'sms'),
    };

    if (existingRecord) {
      const before = inboxAuditState(existingRecord);
      const after = mergeInboxAuditState(existingRecord, safeData);
      return {
        ops: [
          existingRecord.prepareUpdate(record => {
            Object.assign(record, safeData);
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
      Object.assign(entry, safeData);
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

  /** Defers inbox model preparation until the enclosing accounting session flushes. */
  stageUpsertInSession(
    session: AccountingWriteSession,
    data: TransactionInboxRecordWriteData,
    existingRecord: TransactionInboxRecord | null,
    auditContext?: InboxAuditContext,
  ): void {
    stageModelWrite(session, () => this.prepareUpsert(data, existingRecord, auditContext).ops);
  }

  /** Reloads and stages a manual journal link in the enclosing accounting transaction. */
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
    stageModelWrite(session, () =>
      this.prepareLinkOperations(record, journalId, disposition, auditContext),
    );
  }

  async persistLink(
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Promise<void> {
    const record = await this.find(workplaceId, recordId);
    if (!record) return;
    await persistBatch(() => this.prepareLinkOperations(record, journalId, disposition));
  }

  async persistStatus(
    workplaceId: WorkplaceId,
    recordId: string,
    status: InboxProcessingStatus,
  ): Promise<void> {
    const record = await this.find(workplaceId, recordId);
    if (!record) return;
    await persistBatch(() => this.prepareStatusOperations(record, status));
  }

  private prepareLinkOperations(
    record: TransactionInboxRecord,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
    auditContext?: InboxAuditContext,
  ): Model[] {
    const before = inboxAuditState(record);
    const after = mergeInboxAuditState(record, {
      linkedJournalId: journalId,
      processingStatus: disposition,
    });
    return [
      this.prepareLink(record, journalId, disposition),
      ...(!sameInboxAuditState(before, after)
        ? [
            this.prepareAudit(
              record.id,
              AuditAction.UPDATE,
              'transaction_inbox_record.linked',
              before,
              after,
              record.workplaceId,
              'app',
              auditContext?.correlationId,
            ),
          ]
        : []),
    ];
  }

  private prepareStatusOperations(
    record: TransactionInboxRecord,
    status: InboxProcessingStatus,
  ): Model[] {
    const before = inboxAuditState(record);
    const after = mergeInboxAuditState(record, { processingStatus: status });
    return [
      this.prepareStatus(record, status),
      ...(!sameInboxAuditState(before, after)
        ? [
            this.prepareAudit(
              record.id,
              AuditAction.UPDATE,
              'transaction_inbox_record.status_changed',
              before,
              after,
              record.workplaceId,
              'app',
            ),
          ]
        : []),
    ];
  }

  async persistScanBatch(
    buildOps: () => Model[],
    afterBatch?: () => void,
    signal?: AbortSignal,
  ): Promise<boolean> {
    let committed = false;

    await database.write(async () => {
      // Model prepare* calls must be followed by database.batch synchronously.
      // Keep all async reads outside this callback and only prepare operations here.
      const ops = buildOps();
      // Re-check cancellation at the last possible point so an aborted scan cannot enter the
      // write batch or its bookkeeping.
      if (ops.length === 0 || signal?.aborted) return;

      await database.batch(ops);
      committed = true;
    });

    if (committed) afterBatch?.();

    return committed;
  }
}

export const transactionInboxRepository = new TransactionInboxRepository();
