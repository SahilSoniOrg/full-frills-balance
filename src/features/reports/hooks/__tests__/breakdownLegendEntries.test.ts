import {
  mapAccountBreakdownToLegendEntry,
  mapCategoryBreakdownToLegendEntries,
} from '@/src/features/reports/hooks/breakdownLegendEntries';
import { AccountId } from '@/src/types/ids';

describe('breakdownLegendEntries', () => {
  it('maps account breakdowns to legend entries with a single account id', () => {
    expect(
      mapAccountBreakdownToLegendEntry({
        accountId: 'acc-1' as AccountId,
        accountName: 'Groceries',
        amount: 250,
        percentage: 100,
      }),
    ).toEqual({
      id: 'acc-1',
      accountName: 'Groceries',
      amount: 250,
      percentage: 100,
      color: undefined,
      accountIds: ['acc-1'],
    });
  });

  it('maps category breakdowns with formatted labels', () => {
    expect(
      mapCategoryBreakdownToLegendEntries([
        {
          category: 'FOOD',
          amount: 500,
          percentage: 100,
          accountIds: ['food-1', 'food-2'] as AccountId[],
        },
      ]),
    ).toEqual([
      {
        id: 'FOOD',
        accountName: 'Food',
        amount: 500,
        percentage: 100,
        color: undefined,
        accountIds: ['food-1', 'food-2'],
      },
    ]);
  });
});
