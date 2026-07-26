import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import { AuditAction } from '@/src/data/models/AuditLog';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import {
  CreateJournalData,
  journalWriteRepository,
} from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { PreparedJournalData, prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, JournalId, WorkplaceId, mapTransactionToAudit } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
import { Model } from '@nozbe/watermelondb';

/**
 * Canonical journal write Module: prepare + audit + persist + rebuild enqueue.
 * Prefer this over calling JournalRepository create/update helpers directly.
 *
 * Rebuild enqueue policy: enqueue inside the successful write callback for
 * create / createMany / update / post / revert / delete / recover. Update passes
 * an `afterBatch` hook into `updateJournalWithTransactions` (that helper owns the
 * write; nested writes are unsafe).
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

  async updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const originalJournal = await journalQueryRepository.find(workplaceId, journalId);
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

    const originalAccountIds = new Set(originalTransactions.map(t => t.accountId));
    const allAccountsToRebuild = new Set<AccountId>([
      ...prepared.accountsToRebuild,
      ...originalAccountIds,
    ]);
    const rebuildFromDate = Math.min(originalJournal.journalDate, data.journalDate);

    return journalWriteRepository.updateJournalWithTransactions(
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
      () => {
        rebuildQueueService.enqueueMany(allAccountsToRebuild, rebuildFromDate, workplaceId);
      },
    );
  }

  async deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    const prepared = await journalWriteRepository.fetchJournalForDeletion(journalId, workplaceId);
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

      const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
      rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);
    });
  }

  async recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const prepared = await journalWriteRepository.fetchJournalForDeletion(journalId, workplaceId);
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

      const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
      rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);
    });

    return journal;
  }

  async postJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    if (!journal) throw new Error('Journal not found');
    if (journal.status !== JournalStatus.PLANNED) {
      throw new Error(
        `Cannot post journal with status ${journal.status}. Only PLANNED journals can be posted.`,
      );
    }

    const postTime = Date.now();
    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);
    const originalDate = journal.journalDate;

    await database.write(async () => {
      const metadataOp = await journalMetadataRepository.preparePatch(
        workplaceId,
        journalId,
        { [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalDate },
        MetadataSources.MANUAL_POST,
      );

      const journalOp = journal.prepareUpdate((record: Journal) => {
        record.status = JournalStatus.POSTED;
        record.journalDate = postTime;
        record.updatedAt = new Date();
      });

      const txOps = transactions.map(tx =>
        tx.prepareUpdate((record: Transaction) => {
          record.transactionDate = postTime;
          record.updatedAt = new Date();
        }),
      );

      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            before: { status: JournalStatus.PLANNED, journalDate: originalDate },
            after: { status: JournalStatus.POSTED, journalDate: postTime },
          },
        },
        workplaceId,
      );

      await database.batch([metadataOp, journalOp, ...txOps, auditOp]);

      const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
      rebuildQueueService.enqueueMany(accountIds, postTime, workplaceId);
    });

    logger.info(`Manually posted journal ${journalId} at ${new Date(postTime).toLocaleString()}`);
    return journal;
  }

  async revertToPlanned(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    if (!journal) throw new Error('Journal not found');
    if (journal.status !== JournalStatus.POSTED && journal.status !== JournalStatus.SKIPPED) {
      throw new Error(
        `Cannot revert journal with status ${journal.status}. Only POSTED or SKIPPED journals can be reverted.`,
      );
    }

    const currentJournalDate = journal.journalDate;
    let revertTime: number;

    const metadata = await journalMetadataRepository.findByJournalId(journalId, workplaceId);
    if (metadata?.metadataJson) {
      try {
        const json = safeParseJSON<Record<string, any>>(metadata.metadataJson, {});
        if (json[MetadataKeys.ORIGINAL_PLANNED_DATE]) {
          revertTime = json[MetadataKeys.ORIGINAL_PLANNED_DATE];
        } else {
          const date = new Date(currentJournalDate);
          date.setHours(0, 0, 0, 0);
          revertTime = date.getTime();
        }
      } catch {
        const date = new Date(currentJournalDate);
        date.setHours(0, 0, 0, 0);
        revertTime = date.getTime();
      }
    } else {
      const date = new Date(currentJournalDate);
      date.setHours(0, 0, 0, 0);
      revertTime = date.getTime();
    }

    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    await database.write(async () => {
      const journalOp = journal.prepareUpdate((record: Journal) => {
        record.status = JournalStatus.PLANNED;
        record.journalDate = revertTime;
        record.updatedAt = new Date();
      });

      const txOps = transactions.map(tx =>
        tx.prepareUpdate((record: Transaction) => {
          record.transactionDate = revertTime;
          record.updatedAt = new Date();
        }),
      );

      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            // Historical shape: before.status always POSTED (even when reverting SKIPPED).
            before: { status: JournalStatus.POSTED, journalDate: currentJournalDate },
            after: { status: JournalStatus.PLANNED, journalDate: revertTime },
          },
        },
        workplaceId,
      );

      await database.batch([journalOp, ...txOps, auditOp]);

      const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
      rebuildQueueService.enqueueMany(
        accountIds,
        Math.min(currentJournalDate, revertTime),
        workplaceId,
      );
    });

    logger.info(
      `Unposted journal ${journalId}, reverted to PLANNED at ${new Date(revertTime).toLocaleDateString()}`,
    );
    return journal;
  }
}

export const ledgerWriteService = new LedgerWriteService();
