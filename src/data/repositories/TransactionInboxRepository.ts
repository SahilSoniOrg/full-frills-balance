import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { InboxProcessingStatus, JournalId, WorkplaceId } from '@/src/types/domain';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { Model } from '@nozbe/watermelondb';

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

  async persistLink(
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Promise<void> {
    const record = await this.find(workplaceId, recordId);
    if (!record) return;
    await persistBatch([this.prepareLink(record, journalId, disposition)]);
  }

  async persistStatus(
    workplaceId: WorkplaceId,
    recordId: string,
    status: InboxProcessingStatus,
  ): Promise<void> {
    const record = await this.find(workplaceId, recordId);
    if (!record) return;
    await persistBatch([this.prepareStatus(record, status)]);
  }

  async persistScanBatch(buildOps: () => Promise<Model[]>, afterBatch?: () => void): Promise<void> {
    await database.write(async () => {
      const ops = await buildOps();
      if (ops.length > 0) {
        await database.batch(ops);
      }
      afterBatch?.();
    });
  }
}

export const transactionInboxRepository = new TransactionInboxRepository();
