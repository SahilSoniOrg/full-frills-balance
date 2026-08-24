import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { InboxProcessingStatus } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { Model } from '@nozbe/watermelondb';

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
    try {
      const record = await this.inbox.find(id);
      return record.workplaceId === workplaceId ? record : null;
    } catch {
      return null;
    }
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
  ): { ops: Model[]; record: TransactionInboxRecord } {
    if (existingRecord && existingRecord.workplaceId !== data.workplaceId) {
      throw new Error('Inbox record does not belong to the specified workplace');
    }

    if (existingRecord) {
      return {
        ops: [
          existingRecord.prepareUpdate(record => {
            Object.assign(record, data);
          }),
        ],
        record: existingRecord,
      };
    }

    const record = this.inbox.prepareCreate((entry: TransactionInboxRecord) => {
      Object.assign(entry, data);
    });
    return { ops: [record], record };
  }

  async persistLink(
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Promise<void> {
    const record = await this.find(workplaceId, recordId);
    if (!record) return;
    await persistBatch(() => [this.prepareLink(record, journalId, disposition)]);
  }

  async persistStatus(
    workplaceId: WorkplaceId,
    recordId: string,
    status: InboxProcessingStatus,
  ): Promise<void> {
    const record = await this.find(workplaceId, recordId);
    if (!record) return;
    await persistBatch(() => [this.prepareStatus(record, status)]);
  }

  async persistScanBatch(
    buildOps: () => Promise<Model[]>,
    afterBatch?: () => void,
    signal?: AbortSignal,
  ): Promise<boolean> {
    let committed = false;

    await database.write(async () => {
      const ops = await buildOps();
      // The builder yields while analysis/rechecks run. Re-check cancellation at the last
      // possible point so an aborted scan cannot enter the write batch or its bookkeeping.
      if (ops.length === 0 || signal?.aborted) return;

      await database.batch(ops);
      committed = true;
      afterBatch?.();
    });

    return committed;
  }
}

export const transactionInboxRepository = new TransactionInboxRepository();
