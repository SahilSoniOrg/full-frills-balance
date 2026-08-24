import { AccountType, TransactionType, JournalDisplayType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';
import { EnrichedJournal } from '@/src/types/domainReadModels';

import { journalsToBudgetChartTxs } from '@/src/features/budget/helpers/journalsToBudgetChartTxs';
import { journalsToTimelineRows } from '@/src/services/journal/journalTimelineRows';

describe('journalsToTimelineRows', () => {
  const journal: EnrichedJournal = {
    id: 'j1' as JournalId,
    journalDate: 1,
    description: 'Split lunch',
    currencyCode: 'USD',
    status: 'POSTED',
    totalAmount: 100,
    transactionCount: 3,
    displayType: JournalDisplayType.EXPENSE,
    accounts: [
      {
        id: 'cash' as AccountId,
        name: 'Cash',
        accountType: AccountType.ASSET,
        role: 'SOURCE',
        amount: 100,
      },
      {
        id: 'food' as AccountId,
        name: 'Food',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 60,
      },
      {
        id: 'transport' as AccountId,
        name: 'Transport',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 40,
      },
    ],
  };

  it('creates one row per scoped leg with composite list ids when multiple legs match', () => {
    const rows = journalsToTimelineRows([journal], {
      expandAccountIds: ['food' as AccountId, 'transport' as AccountId],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].listId).toBe('j1_food');
    expect(rows[1].listId).toBe('j1_transport');
    expect(rows[0].selectionId).toBe('j1');
    expect(rows[0].viewer?.accountId).toBe('food');
  });

  it('uses journal id as list id when only one scoped leg matches', () => {
    const rows = journalsToTimelineRows([journal], {
      expandAccountIds: ['food' as AccountId],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].listId).toBe('j1');
    expect(rows[0].selectionId).toBe('j1');
  });
});

describe('journalsToBudgetChartTxs', () => {
  it('maps scoped legs to debit/credit chart rows', () => {
    const txs = journalsToBudgetChartTxs(
      [
        {
          id: 'j1' as JournalId,
          journalDate: 100,
          currencyCode: 'USD',
          status: 'POSTED',
          totalAmount: 50,
          transactionCount: 2,
          displayType: JournalDisplayType.EXPENSE,
          accounts: [
            {
              id: 'cash' as AccountId,
              name: 'Cash',
              accountType: AccountType.ASSET,
              role: 'SOURCE',
              amount: 50,
            },
            {
              id: 'food' as AccountId,
              name: 'Food',
              accountType: AccountType.EXPENSE,
              role: 'DESTINATION',
              amount: 50,
            },
          ],
        },
      ],
      ['food' as AccountId],
    );

    expect(txs).toEqual([
      {
        transactionDate: 100,
        amount: 50,
        currencyCode: 'USD',
        transactionType: TransactionType.DEBIT,
      },
    ]);
  });
});
