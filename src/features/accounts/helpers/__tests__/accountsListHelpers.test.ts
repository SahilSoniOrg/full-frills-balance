import { AccountType } from '@/src/data/models/Account';
import { AccountId } from '@/src/types/domain';
import {
  aggregateLeafPeriodIncomeExpense,
  filterAccountsBySearch,
  filterAccountsForListTab,
  resolveAccountListPressAction,
  resolveInflowTotals,
} from '../accountsListHelpers';

describe('accountsListHelpers', () => {
  const accounts = [
    { id: '1', name: 'Cash', accountType: AccountType.ASSET, parentAccountId: null },
    { id: '2', name: 'Food', accountType: AccountType.EXPENSE, parentAccountId: null },
    { id: '3', name: 'Wallet', accountType: AccountType.ASSET, parentAccountId: '1' },
  ] as any[];

  it('filterAccountsBySearch is case-insensitive', () => {
    expect(filterAccountsBySearch(accounts, 'cash')).toHaveLength(1);
    expect(filterAccountsBySearch(accounts, '')).toHaveLength(3);
  });

  it('filterAccountsForListTab splits categories vs accounts', () => {
    expect(filterAccountsForListTab(accounts, 'accounts')).toHaveLength(2);
    expect(filterAccountsForListTab(accounts, 'categories')).toHaveLength(1);
  });

  it('resolveAccountListPressAction expands before navigate', () => {
    expect(resolveAccountListPressAction('1' as AccountId, accounts, new Set())).toBe('expand');
    expect(resolveAccountListPressAction('1' as AccountId, accounts, new Set(['1']))).toBe(
      'navigate',
    );
    expect(resolveAccountListPressAction('2' as AccountId, accounts, new Set())).toBe('navigate');
  });

  it('aggregateLeafPeriodIncomeExpense sums leaf income and expense period flows', () => {
    const accounts = [
      { id: 'inc', parentAccountId: null, accountType: AccountType.INCOME },
      { id: 'inc-child', parentAccountId: 'inc', accountType: AccountType.INCOME },
      { id: 'exp', parentAccountId: null, accountType: AccountType.EXPENSE },
    ] as any[];
    const balances = [
      {
        accountId: 'inc',
        accountType: AccountType.INCOME,
        monthlyIncome: 100,
        monthlyExpenses: 0,
      },
      {
        accountId: 'inc-child',
        accountType: AccountType.INCOME,
        monthlyIncome: 50,
        monthlyExpenses: 0,
      },
      {
        accountId: 'exp',
        accountType: AccountType.EXPENSE,
        monthlyIncome: 0,
        monthlyExpenses: 40,
      },
    ] as any[];

    expect(aggregateLeafPeriodIncomeExpense(accounts, balances)).toEqual({
      income: 50,
      expense: 40,
    });
  });

  it('resolveInflowTotals uses period totals when not overall', () => {
    expect(
      resolveInflowTotals({
        inflowPeriod: 'overall',
        totalIncome: 10,
        totalExpense: 5,
        periodTotals: { income: 1, expense: 2 },
      }),
    ).toEqual({ inflowIncome: 10, inflowExpense: 5 });

    expect(
      resolveInflowTotals({
        inflowPeriod: 'month',
        totalIncome: 10,
        totalExpense: 5,
        periodTotals: { income: 3, expense: 4 },
      }),
    ).toEqual({ inflowIncome: 3, inflowExpense: 4 });
  });
});
