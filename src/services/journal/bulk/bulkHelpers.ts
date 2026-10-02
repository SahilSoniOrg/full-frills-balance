import Transaction from '@/src/data/models/Transaction';
import { JournalId } from '@/src/types/ids';

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
