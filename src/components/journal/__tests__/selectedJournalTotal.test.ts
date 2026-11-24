import { journalsToTimelineRows } from '@/src/services/journal/journalTimelineRows';
import { computeSelectedJournalsTotal } from '@/src/services/journal/selectedJournalTotal';
import type { EnrichedJournal } from '@/src/types/domainReadModels';
import { AccountType, JournalDisplayType } from '@/src/types/enums';
import { asAccountId, asJournalId } from '@/src/types/ids';

function journal(
  id: string,
  displayType: JournalDisplayType,
  totalAmount: number,
  currencyCode: string,
  accounts: EnrichedJournal['accounts'] = [],
): EnrichedJournal {
  return {
    id: asJournalId(id),
    journalDate: 0,
    displayType,
    totalAmount,
    currencyCode,
    status: 'POSTED',
    accounts,
    transactionCount: accounts.length,
  };
}

describe('computeSelectedJournalsTotal', () => {
  it('nets income and expenses within each currency', () => {
    const journals = [
      journal('expense', JournalDisplayType.EXPENSE, 1100, 'INR'),
      journal('income', JournalDisplayType.INCOME, 500, 'INR'),
      journal('foreign', JournalDisplayType.INCOME, 50, 'USD'),
      journal('unselected', JournalDisplayType.INCOME, 25, 'USD'),
    ];
    const selected = new Set(['expense', 'income', 'foreign'].map(asJournalId));

    expect(computeSelectedJournalsTotal(journalsToTimelineRows(journals), selected)).toEqual({
      amounts: [
        { amount: -600, currencyCode: 'INR' },
        { amount: 50, currencyCode: 'USD' },
      ],
      incomplete: false,
      includedCount: 3,
    });
  });

  it('uses the whole journal once unscoped and each matching leg once when scoped', () => {
    const food = asAccountId('food');
    const transit = asAccountId('transit');
    const split = journal('split', JournalDisplayType.EXPENSE, 100, 'USD', [
      { id: food, name: 'Food', accountType: AccountType.EXPENSE, role: 'DESTINATION', amount: 60 },
      {
        id: transit,
        name: 'Transit',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 40,
      },
    ]);
    const selected = new Set([split.id]);
    const unscoped = journalsToTimelineRows([split]);
    const scoped = journalsToTimelineRows([split], { expandAccountIds: [food, transit] });

    expect(computeSelectedJournalsTotal([...unscoped, ...unscoped], selected).amounts).toEqual([
      { amount: -100, currencyCode: 'USD' },
    ]);
    expect(computeSelectedJournalsTotal([...scoped].reverse(), selected).amounts).toEqual([
      { amount: -100, currencyCode: 'USD' },
    ]);
    expect(
      computeSelectedJournalsTotal(
        journalsToTimelineRows([split], { expandAccountIds: [food] }),
        selected,
      ).amounts,
    ).toEqual([{ amount: -60, currencyCode: 'USD' }]);
  });

  it('keeps separate native-currency buckets for selected split legs', () => {
    const euro = asAccountId('euro');
    const dollar = asAccountId('dollar');
    const split = journal('split', JournalDisplayType.EXPENSE, 100, 'USD', [
      {
        id: euro,
        name: 'Euro',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 50,
        currencyCode: 'EUR',
      },
      {
        id: dollar,
        name: 'Dollar',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 40,
        currencyCode: 'USD',
      },
    ]);
    const rows = journalsToTimelineRows([split], { expandAccountIds: [euro, dollar] });

    expect(computeSelectedJournalsTotal(rows, new Set([split.id])).amounts).toEqual([
      { amount: -50, currencyCode: 'EUR' },
      { amount: -40, currencyCode: 'USD' },
    ]);
  });

  it('marks scoped totals as partial when a selected posting amount is unavailable', () => {
    const food = asAccountId('food');
    const transit = asAccountId('transit');
    const split = journal('split', JournalDisplayType.EXPENSE, 100, 'USD', [
      { id: food, name: 'Food', accountType: AccountType.EXPENSE, role: 'DESTINATION', amount: 60 },
      { id: transit, name: 'Transit', accountType: AccountType.EXPENSE, role: 'DESTINATION' },
    ]);
    const selected = new Set([split.id]);

    expect(
      computeSelectedJournalsTotal(
        journalsToTimelineRows([split], { expandAccountIds: [food, transit] }),
        selected,
      ),
    ).toEqual({
      amounts: [{ amount: -60, currencyCode: 'USD' }],
      incomplete: true,
      includedCount: 1,
    });

    expect(
      computeSelectedJournalsTotal(
        journalsToTimelineRows([split], { viewer: { accountId: asAccountId('unavailable') } }),
        selected,
      ),
    ).toEqual({ amounts: [], incomplete: true, includedCount: 0 });
  });

  it('skips unscoped zero-flow transfers without marking totals incomplete, while keeping scoped legs and real zero nets', () => {
    const checking = asAccountId('checking');
    const savings = asAccountId('savings');
    const transfer = journal('transfer', JournalDisplayType.TRANSFER, 500, 'EUR', [
      {
        id: checking,
        name: 'Checking',
        accountType: AccountType.ASSET,
        role: 'SOURCE',
        amount: 500,
        currencyCode: 'EUR',
      },
      {
        id: savings,
        name: 'Savings',
        accountType: AccountType.ASSET,
        role: 'DESTINATION',
        amount: 500,
        currencyCode: 'EUR',
      },
    ]);
    const expense = journal('expense', JournalDisplayType.EXPENSE, 20, 'USD');
    const income = journal('income', JournalDisplayType.INCOME, 20, 'USD');

    expect(
      computeSelectedJournalsTotal(journalsToTimelineRows([transfer]), new Set([transfer.id])),
    ).toEqual({ amounts: [], incomplete: false, includedCount: 0 });

    expect(
      computeSelectedJournalsTotal(
        journalsToTimelineRows([transfer, expense]),
        new Set([transfer.id, expense.id]),
      ),
    ).toEqual({
      amounts: [{ amount: -20, currencyCode: 'USD' }],
      incomplete: false,
      includedCount: 1,
    });

    expect(
      computeSelectedJournalsTotal(
        journalsToTimelineRows([income, expense]),
        new Set([income.id, expense.id]),
      ),
    ).toEqual({
      amounts: [{ amount: 0, currencyCode: 'USD' }],
      incomplete: false,
      includedCount: 2,
    });

    expect(
      computeSelectedJournalsTotal(
        journalsToTimelineRows([transfer], { viewer: { accountId: checking } }),
        new Set([transfer.id]),
      ),
    ).toEqual({
      amounts: [{ amount: -500, currencyCode: 'EUR' }],
      incomplete: false,
      includedCount: 1,
    });
  });
});
