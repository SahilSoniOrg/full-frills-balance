import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import {
  CreateJournalData,
  journalWriteRepository,
} from '@/src/data/repositories/journal/journalWriteModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import {
  AccountId,
  AuditAction,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { isRebuildEligibleJournalStatus } from '@/src/utils/journalActiveStatus';
import { Model } from '@nozbe/watermelondb';
import { PreparedJournalData, prepareJournalData } from './prepareJournalData';

export interface BatchWriteOptions<T = Journal> {
  extraOps?: Model[] | ((entity: T) => Model[]);
  afterBatch?: () => void;
}

export class LedgerCreateService {
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
      journalWriteRepository.prepareCreateJournalWithTransactions(
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

  async createJournal(
    data: CreateJournalData,
    workplaceId: WorkplaceId,
    options?: BatchWriteOptions<Journal>,
  ): Promise<Journal> {
    const { journal, ops, accountsToRebuild } = await this.prepareCreateJournal(data, workplaceId);
    const extras =
      typeof options?.extraOps === 'function'
        ? options.extraOps(journal)
        : (options?.extraOps ?? []);

    await database.write(async () => {
      await database.batch([...ops, ...extras]);

      const activeStatus = isRebuildEligibleJournalStatus(data.status);
      if (activeStatus && accountsToRebuild.size > 0) {
        rebuildQueueService.enqueueMany(accountsToRebuild, data.journalDate, workplaceId);
      }
      options?.afterBatch?.();
    });

    return journal;
  }

  /**
   * Batch-create journals in one write. Callers must pre-run `prepareJournalData`
   * (or pass already-prepared pairs) so async work stays outside the write block.
   */
  async createMany(
    items: { data: CreateJournalData; prepared: PreparedJournalData }[],
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    if (items.length === 0) return [];

    const journals: Journal[] = [];
    const allAccountsToRebuild = new Set<AccountId>();
    let minDate = Infinity;

    await database.write(async () => {
      const allOps: Model[] = [];
      for (const item of items) {
        const { journal, ops, accountsToRebuild } = this.prepareCreateJournalFromPreparedData(
          item.data,
          item.prepared,
          workplaceId,
        );
        journals.push(journal);
        allOps.push(...ops);
        for (const accountId of accountsToRebuild) {
          allAccountsToRebuild.add(accountId);
        }
        minDate = Math.min(minDate, item.data.journalDate);
      }

      await database.batch(allOps);

      if (allAccountsToRebuild.size > 0) {
        rebuildQueueService.enqueueMany(allAccountsToRebuild, minDate, workplaceId);
      }
    });

    return journals;
  }

  async createReversalJournal(
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const originalJournal = await journalQueryRepository.find(workplaceId, originalJournalId);
    if (!originalJournal) throw new Error('Original journal not found');

    const originalTransactions = await transactionQueryRepository.findByJournal(
      workplaceId,
      originalJournalId,
    );
    const reversedTxs = originalTransactions.map(tx => ({
      accountId: tx.accountId,
      amount: tx.amount,
      transactionType:
        tx.transactionType === TransactionType.DEBIT
          ? TransactionType.CREDIT
          : TransactionType.DEBIT,
      notes: `Reversal: ${tx.notes || ''}`,
      exchangeRate: tx.exchangeRate || 1,
    }));

    const { journal, ops, accountsToRebuild } = await this.prepareCreateJournal(
      {
        journalDate: Date.now(),
        description: `Reversal of: ${originalJournal.description || originalJournalId} (${reason})`,
        currencyCode: originalJournal.currencyCode,
        transactions: reversedTxs,
        originalJournalId,
      },
      workplaceId,
    );

    await journalWriteRepository.persistReversal({
      workplaceId,
      originalJournal,
      reversingJournalId: journal.id,
      reversalOps: ops,
      afterBatch: () => {
        if (accountsToRebuild.size > 0) {
          rebuildQueueService.enqueueMany(
            accountsToRebuild,
            originalJournal.journalDate,
            workplaceId,
          );
        }
      },
    });

    return journal;
  }
}

export const ledgerCreateService = new LedgerCreateService();
