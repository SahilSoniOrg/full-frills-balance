import { sortDestinationAccounts } from '../sortDestinationAccounts';
import { AccountType } from '@/src/types/enums';

describe('sortDestinationAccounts', () => {
  it('orders expense categories, liabilities and assets stably without dropping accounts', () => {
    const accounts = [
      { id: 'asset-1', accountType: AccountType.ASSET },
      { id: 'liability-1', accountType: AccountType.LIABILITY },
      { id: 'expense-1', accountType: AccountType.EXPENSE },
      { id: 'asset-2', accountType: AccountType.ASSET },
      { id: 'expense-2', accountType: AccountType.EXPENSE },
      { id: 'other', accountType: AccountType.INCOME },
      { id: 'liability-2', accountType: AccountType.LIABILITY },
    ];

    expect(sortDestinationAccounts(accounts).map(({ id }) => id)).toEqual([
      'expense-1', 'expense-2', 'liability-1', 'liability-2', 'asset-1', 'asset-2', 'other',
    ]);
    expect(sortDestinationAccounts(accounts)).toHaveLength(accounts.length);
    expect(accounts.map(({ id }) => id)).toEqual([
      'asset-1', 'liability-1', 'expense-1', 'asset-2', 'expense-2', 'other', 'liability-2',
    ]);
  });
});
