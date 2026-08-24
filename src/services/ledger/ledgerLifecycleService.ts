import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { AuditAction, JournalStatus } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
import { BatchWriteOptions } from './ledgerCreateService';

export class LedgerLifecycleService {
  async deleteJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    const prepared = await journalWriteRepository.fetchJournalForDeletion(journalId, workplaceId);
    if (!prepared) return;

    const { journal, transactions } = prepared;
    const now = new Date();

    await persistBatch(
      () => {
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

        return [journalOp, ...txOps, auditOp];
      },
      () => {
        const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
        rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);
      },
    );
  }

  async recoverJournal(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const prepared = await journalWriteRepository.fetchJournalForDeletion(journalId, workplaceId);
    if (!prepared) throw new Error('Journal not found');

    const { journal, transactions } = prepared;
    const prevDeletedAt = journal.deletedAt ? new Date(journal.deletedAt.getTime()) : undefined;

    const now = new Date();

    await persistBatch(
      () => {
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

        return [journalOp, ...txOps, auditOp];
      },
      () => {
        const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
        rebuildQueueService.enqueueMany(accountIds, journal.journalDate, workplaceId);
      },
    );

    return journal;
  }

  async postJournal(
    journalId: JournalId,
    workplaceId: WorkplaceId,
    options?: BatchWriteOptions<Journal>,
  ): Promise<Journal> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    if (!journal) throw new Error('Journal not found');
    if (journal.status !== JournalStatus.PLANNED) {
      throw new Error(
        `Cannot post journal with status ${journal.status}. Only PLANNED journals can be posted.`,
      );
    }

    const postTime = Date.now();
    const transactions = await transactionQueryRepository.findByJournal(workplaceId, journalId);
    const originalDate = journal.journalDate;
    const metadataOp = await journalMetadataRepository.preparePatch(
      workplaceId,
      journalId,
      { [MetadataKeys.ORIGINAL_PLANNED_DATE]: originalDate },
      MetadataSources.MANUAL_POST,
    );

    await persistBatch(
      () => {
        const extras =
          typeof options?.extraOps === 'function'
            ? options.extraOps(journal)
            : (options?.extraOps ?? []);

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

        return [metadataOp, journalOp, ...txOps, auditOp, ...extras];
      },
      () => {
        const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
        rebuildQueueService.enqueueMany(accountIds, postTime, workplaceId);
        options?.afterBatch?.();
      },
    );

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

    if (journal.plannedPaymentId) {
      const plannedPayment = await plannedPaymentRepository.find(
        workplaceId,
        journal.plannedPaymentId,
      );
      if (!plannedPayment) {
        throw new Error('Cannot revert to scheduled because the planned payment was deleted.');
      }
    }

    const currentJournalDate = journal.journalDate;

    const metadata = await journalMetadataRepository.findByJournalId(journalId, workplaceId);
    const storedDate = metadata?.metadataJson
      ? safeParseJSON<Record<string, number>>(metadata.metadataJson, {})[
          MetadataKeys.ORIGINAL_PLANNED_DATE
        ]
      : undefined;
    const revertTime = storedDate || normalizeToStartOfDay(currentJournalDate);

    const transactions = await transactionQueryRepository.findByJournal(workplaceId, journalId);

    await persistBatch(
      () => {
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
              before: { status: JournalStatus.POSTED, journalDate: currentJournalDate },
              after: { status: JournalStatus.PLANNED, journalDate: revertTime },
            },
          },
          workplaceId,
        );

        return [journalOp, ...txOps, auditOp];
      },
      () => {
        const accountIds = Array.from(new Set(transactions.map((t: Transaction) => t.accountId)));
        rebuildQueueService.enqueueMany(
          accountIds,
          Math.min(currentJournalDate, revertTime),
          workplaceId,
        );
      },
    );

    logger.info(
      `Unposted journal ${journalId}, reverted to PLANNED at ${new Date(revertTime).toLocaleDateString()}`,
    );
    return journal;
  }
}

export const ledgerLifecycleService = new LedgerLifecycleService();
