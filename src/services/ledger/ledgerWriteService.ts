import { database } from '@/src/data/database/Database';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Model } from '@nozbe/watermelondb';

export class LedgerWriteService {
  async prepareCreateJournal(data: CreateJournalData): Promise<{
    journal: Journal;
    ops: Model[];
    accountsToRebuild: Set<string>;
  }> {
    const prepared = await prepareJournalData(data);

    const { journal, transactions, metadataRecord } =
      journalRepository.prepareCreateJournalWithTransactions({
        ...data,
        transactions: prepared.transactions,
        totalAmount: prepared.totalAmount,
        displayType: prepared.displayType,
        calculatedBalances: prepared.calculatedBalances,
      });

    const ops: Model[] = [journal, ...transactions];
    if (metadataRecord) ops.push(metadataRecord);

    // Standardized audit log creation via repository
    const auditLog = auditRepository.prepareLog({
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.CREATE,
      changes: { description: data.description },
    });
    ops.push(auditLog);

    return { journal, ops, accountsToRebuild: prepared.accountsToRebuild };
  }

  async createJournal(data: CreateJournalData): Promise<Journal> {
    const { journal, ops, accountsToRebuild } = await this.prepareCreateJournal(data);

    await database.write(async () => {
      await database.batch(...ops);

      // Move enqueue inside write block for better atomicity.
      // Even though it writes to storage, calling it here ensures that if the DB write succeeds,
      // the rebuild request is also issued before the transaction completes and observers are notified.
      const activeStatus = !data.status || ACTIVE_JOURNAL_STATUSES.includes(data.status as any);
      if (activeStatus && accountsToRebuild.size > 0) {
        rebuildQueueService.enqueueMany(accountsToRebuild, data.journalDate);
      }
    });

    return journal;
  }
}

export const ledgerWriteService = new LedgerWriteService();
