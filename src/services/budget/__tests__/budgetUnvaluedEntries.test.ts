import { asJournalId } from '@/src/types/ids';
import { summarizeBudgetUnvaluedEntries } from '../budgetUnvaluedEntries';

it('counts missing currency valuations by unique entries rather than split legs', () => {
  expect(
    summarizeBudgetUnvaluedEntries([
      { journalId: asJournalId('one'), currencyCode: 'JPY' },
      { journalId: asJournalId('one'), currencyCode: 'JPY' },
      { journalId: asJournalId('two'), currencyCode: 'JPY' },
      { journalId: asJournalId('one'), currencyCode: 'EUR' },
    ]),
  ).toEqual({
    unvaluedEntryCount: 2,
    unvaluedCurrencyCounts: [
      { currencyCode: 'EUR', count: 1 },
      { currencyCode: 'JPY', count: 2 },
    ],
  });
});
