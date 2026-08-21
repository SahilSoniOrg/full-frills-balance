import Transaction from '@/src/data/models/Transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';

/** Groups a flat transaction list into a map keyed by journalId. */
export function groupTransactionsByJournal(
  transactions: Transaction[],
): Map<JournalId, Transaction[]> {
  const map = new Map<JournalId, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.journalId;
    const list = map.get(key) ?? [];
    list.push(tx);
    map.set(key, list);
  }
  return map;
}

/** Enqueues a running-balance rebuild only when there is meaningful work. */
export function enqueueRebuildIfNeeded(
  accounts: Set<AccountId>,
  minDate: number,
  workplaceId: WorkplaceId,
): void {
  if (accounts.size > 0 && minDate !== Infinity) {
    rebuildQueueService.enqueueMany(accounts, minDate, workplaceId);
  }
}
