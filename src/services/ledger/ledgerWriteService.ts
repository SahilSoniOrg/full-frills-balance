import { database } from '@/src/data/database/Database';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { PreparedJournalData, prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, JournalId, WorkplaceId, mapTransactionToAudit } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Model } from '@nozbe/watermelondb';

/**
 * Canonical journal write Module: prepare + audit + persist + rebuild enqueue.
 * Prefer this over calling JournalRepository create/update helpers directly.
 */
export class LedgerWriteService {
  async prepareCreateJournal(
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<{
    journal: Journal;
    ops: Model[];
    accountsToRebuild: Set<AccountId>;
  }> {
    const prepared = await prepareJournalData(data, workplaceId);
    return this.prepareCreateJournalFromPreparedData(data, prepared, workplaceId);
  }

  /**
   * Synchronous part of journal preparation.
   * Can be called inside a batch loop if the async 'prepareJournalData' was already called.
   */
  prepareCreateJournalFromPreparedData(
    data: CreateJournalData,
    prepared: PreparedJournalData,
    workplaceId: WorkplaceId,
  ): {
    journal: Journal;
    ops: Model[];
    accountsToRebuild: Set<AccountId>;
  } {
    const { journal, transactions, metadataRecord } =
      journalRepository.prepareCreateJournalWithTransactions(
        {
          ...data,
          transactions: prepared.transactions,
          totalAmount: prepared.totalAmount,
          displayType: prepared.displayType,
          calculatedBalances: prepared.calculatedBalances,
        },
        workplaceId,
      );

    const ops: Model[] = [journal, ...transactions];
    if (metadataRecord) ops.push(metadataRecord);

    const auditLog = auditRepository.prepareLog(
      {
        entityType: 'journal',
        entityId: journal.id,
        action: AuditAction.CREATE,
        changes: { description: data.description },
      },
      workplaceId,
    );
    ops.push(auditLog);

    return { journal, ops, accountsToRebuild: prepared.accountsToRebuild };
  }

  async createJournal(data: CreateJournalData, workplaceId: WorkplaceId): Promise<Journal> {
    const { journal, ops, accountsToRebuild } = await this.prepareCreateJournal(data, workplaceId);

    await database.write(async () => {
      await database.batch(ops);

      const activeStatus = !data.status || ACTIVE_JOURNAL_STATUSES.includes(data.status as any);
      if (activeStatus && accountsToRebuild.size > 0) {
        rebuildQueueService.enqueueMany(accountsToRebuild, data.journalDate, workplaceId);
      }
    });

    return journal;
  }

  async updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const originalJournal = await journalRepository.find(workplaceId, journalId);
    if (!originalJournal) throw new Error('Journal not found');

    const originalTransactions = await transactionRepository.findByJournal(workplaceId, journalId);
    const prepared = await prepareJournalData(data, workplaceId);

    const extraOpCreator = () => {
      const mappedBeforeTransactions = originalTransactions.map(t => mapTransactionToAudit(t));
      const mappedAfterTransactions = data.transactions.map(t => mapTransactionToAudit(t));
      return auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            before: {
              description: originalJournal.description,
              journalDate: originalJournal.journalDate,
              currencyCode: originalJournal.currencyCode,
              status: originalJournal.status,
              totalAmount: originalJournal.totalAmount,
              transactions: mappedBeforeTransactions,
            },
            after: {
              description: data.description,
              journalDate: data.journalDate,
              transactions: mappedAfterTransactions,
            },
          },
        },
        workplaceId,
      );
    };

    const journal = await journalRepository.updateJournalWithTransactions(
      workplaceId,
      journalId,
      {
        ...data,
        transactions: prepared.transactions,
        totalAmount: prepared.totalAmount,
        displayType: prepared.displayType,
        calculatedBalances: prepared.calculatedBalances,
        metadata: data.metadata,
      },
      extraOpCreator,
    );

    const originalAccountIds = new Set(originalTransactions.map(t => t.accountId));
    const allAccountsToRebuild = new Set<AccountId>([
      ...prepared.accountsToRebuild,
      ...originalAccountIds,
    ]);
    const rebuildFromDate = Math.min(originalJournal.journalDate, data.journalDate);
    rebuildQueueService.enqueueMany(allAccountsToRebuild, rebuildFromDate, workplaceId);

    return journal;
  }

  async deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    const prepared = await journalRepository.fetchJournalForDeletion(journalId, workplaceId);
    if (!prepared) return;

    const { journal, transactions } = prepared;

    await database.write(async () => {
      const now = new Date();
      const journalOp = journal.prepareUpdate(j => {
        j.deletedAt = now;
        j.updatedAt = now;
      });
      const txOps = transactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = now;
          t.updatedAt = now;
        }),
      );

      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.DELETE,
          changes: {
            before: {
              description: journal.description,
              totalAmount: journal.totalAmount,
              currencyCode: journal.currencyCode,
              transactions: transactions.map(t => mapTransactionToAudit(t)),
            },
            after: { deletedAt: now },
          },
        },
        workplaceId,
      );

      await database.batch([journalOp, ...txOps, auditOp]);
    });

    const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
    rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);
  }

  async recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const prepared = await journalRepository.fetchJournalForDeletion(journalId, workplaceId);
    if (!prepared) throw new Error('Journal not found');

    const { journal, transactions } = prepared;
    const prevDeletedAt = journal.deletedAt ? new Date(journal.deletedAt.getTime()) : undefined;

    await database.write(async () => {
      const now = new Date();
      const journalOp = journal.prepareUpdate(j => {
        j.deletedAt = undefined;
        j.updatedAt = now;
      });
      const txOps = transactions.map(tx =>
        tx.prepareUpdate(t => {
          t.deletedAt = undefined;
          t.updatedAt = now;
        }),
      );

      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            before: { deletedAt: prevDeletedAt },
            after: { restoredAt: now },
          },
        },
        workplaceId,
      );

      await database.batch([journalOp, ...txOps, auditOp]);
    });

    const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
    rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);

    return journal;
  }
}

export const ledgerWriteService = new LedgerWriteService();
