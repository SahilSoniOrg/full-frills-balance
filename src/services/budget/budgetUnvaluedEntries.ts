import type { JournalId } from '@/src/types/ids';

export interface BudgetUnvaluedCurrencyCount {
  currencyCode: string;
  count: number;
}

/** Count entries rather than posting legs; one split entry can need rates in several currencies. */
export function summarizeBudgetUnvaluedEntries(
  entries: { journalId: JournalId; currencyCode: string }[],
) {
  const byCurrency = new Map<string, Set<JournalId>>();
  for (const entry of entries) {
    const ids = byCurrency.get(entry.currencyCode) ?? new Set<JournalId>();
    ids.add(entry.journalId);
    byCurrency.set(entry.currencyCode, ids);
  }
  return {
    unvaluedEntryCount: new Set(entries.map(entry => entry.journalId)).size,
    unvaluedCurrencyCounts: [...byCurrency]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currencyCode, ids]) => ({ currencyCode, count: ids.size })),
  };
}
