import Journal from '@/src/data/models/Journal';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { JournalDisplayType, JournalId, TransactionType, WorkplaceId } from '@/src/types/domain';
import { enqueueRebuildIfNeeded, groupTransactionsByJournal } from './bulkHelpers';

/**
 * Duplicates a set of journals into new active entries in a single atomic database batch.
 */
export async function bulkDuplicateJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<Journal[]> {
  if (journalIds.length === 0) return [];

  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
  const transactions = await transactionQueryRepository.findByJournals(workplaceId, journalIds);
  const txByJournal = groupTransactionsByJournal(transactions);

  const now = Date.now();
  const createItems = journals.map(journal => {
    const txs = txByJournal.get(journal.id) ?? [];
    return {
      journalDate: now,
      description: journal.description ? `${journal.description}` : undefined,
      currencyCode: journal.currencyCode,
      totalAmount: journal.totalAmount,
      displayType: journal.displayType as JournalDisplayType,
      transactions: txs.map(tx => ({
        accountId: tx.accountId,
        amount: tx.amount,
        transactionType: tx.transactionType as TransactionType,
        notes: tx.notes,
        exchangeRate: tx.exchangeRate,
        currencyCode: tx.currencyCode,
      })),
    };
  });

  const {
    journals: createdJournals,
    affectedAccountIds,
    minDate,
  } = await journalWriteRepository.bulkCreateJournals(workplaceId, createItems);

  enqueueRebuildIfNeeded(affectedAccountIds, minDate, workplaceId);

  return createdJournals;
}
