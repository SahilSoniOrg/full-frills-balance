import {
  buildTimelineGroupingOptions,
  getJournalViewerSignedAmount,
} from '@/src/features/journal/list/hooks/journalDayNetGrouping';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { AccountType, JournalDisplayType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';

describe('getJournalViewerSignedAmount', () => {
  it('converts a scoped native line using its own currency', () => {
    const journal: EnrichedJournal = {
      id: 'j1' as JournalId,
      journalDate: 1,
      currencyCode: 'INR',
      status: 'POSTED',
      totalAmount: 800,
      transactionCount: 2,
      displayType: JournalDisplayType.TRANSFER,
      accounts: [
        {
          id: 'dollar-account' as AccountId,
          name: 'Dollar account',
          accountType: AccountType.ASSET,
          role: 'SOURCE',
          amount: 10,
          currencyCode: 'USD',
        },
      ],
    };

    expect(
      getJournalViewerSignedAmount(journal, { accountId: 'dollar-account' as AccountId }, 'INR', {
        USD: 0.0125,
      }),
    ).toBe(-800);
  });
});

const leg = (
  id: string,
  accountType: AccountType,
  role: EnrichedJournal['accounts'][number]['role'],
): EnrichedJournal['accounts'][number] => ({
  id: id as AccountId,
  name: id,
  accountType,
  role,
  amount: 100,
  currencyCode: 'INR',
});

const journalWith = (
  id: string,
  displayType: JournalDisplayType,
  accounts: EnrichedJournal['accounts'],
): EnrichedJournal => ({
  id: id as JournalId,
  journalDate: 1,
  currencyCode: 'INR',
  status: 'POSTED',
  totalAmount: 100,
  transactionCount: accounts.length,
  displayType,
  accounts,
});

describe('day-net sign matches the row sign', () => {
  const rowFor = (journal: EnrichedJournal): JournalTimelineRow => ({
    journal,
    listId: journal.id,
    selectionId: journal.id,
  });
  const dayNet = (rows: JournalTimelineRow[]) =>
    buildTimelineGroupingOptions(rows, 'INR', 2, {}, () => {}).getStats(rows).netAmount;

  it('nets a purchase, a refund and a transfer as spending, income and nothing', () => {
    const purchase = journalWith('p', JournalDisplayType.EXPENSE, [
      leg('bank', AccountType.ASSET, 'SOURCE'),
      leg('shopping', AccountType.EXPENSE, 'DESTINATION'),
    ]);
    const refund = journalWith('r', JournalDisplayType.EXPENSE, [
      leg('shopping', AccountType.EXPENSE, 'SOURCE'),
      leg('bank', AccountType.ASSET, 'DESTINATION'),
    ]);
    const transfer = journalWith('t', JournalDisplayType.TRANSFER, [
      leg('bank', AccountType.ASSET, 'SOURCE'),
      leg('savings', AccountType.ASSET, 'DESTINATION'),
    ]);
    expect(dayNet([rowFor(purchase)])).toBe(-100);
    expect(dayNet([rowFor(refund)])).toBe(100);
    expect(dayNet([rowFor(transfer)])).toBe(0);
    expect(dayNet([rowFor(purchase), rowFor(refund), rowFor(transfer)])).toBe(0);
  });

  it('signs a viewed expense leg as spending', () => {
    const purchase = journalWith('p', JournalDisplayType.EXPENSE, [
      leg('bank', AccountType.ASSET, 'SOURCE'),
      leg('shopping', AccountType.EXPENSE, 'DESTINATION'),
    ]);
    expect(
      getJournalViewerSignedAmount(purchase, { accountId: 'shopping' as AccountId }, 'INR', {}),
    ).toBe(-100);
    expect(
      getJournalViewerSignedAmount(purchase, { accountId: 'bank' as AccountId }, 'INR', {}),
    ).toBe(-100);
  });
});
