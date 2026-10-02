import { act, renderHook, waitFor } from '@testing-library/react-native';
import { BehaviorSubject, of } from 'rxjs';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { asAccountId, asBudgetId, asWorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import type { PlainAccount, PlainBudget } from '@/src/types/plainDtos';
import { useBudgetListViewModel } from '../useBudgetListViewModel';
import { Icon } from '@/src/types/domainIcons';

jest.mock('@/src/services/accounts/accountQueries', () => ({
  accountQueries: { observeAll: jest.fn() },
}));
jest.mock('@/src/services/budget/budgetReadService', () => ({
  budgetReadService: {
    observeAllActive: jest.fn(),
    observeBudgetUsage: jest.fn(),
    observeScopes: jest.fn(),
  },
}));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toBudgetDetail: jest.fn() } }));

const workplaceId = asWorkplaceId('workplace');
const categoryId = asAccountId('category');
const fundingId = asAccountId('funding');
const budget: PlainBudget = {
  id: asBudgetId('budget'),
  name: 'Quarterly spending',
  amount: 900,
  currencyCode: 'USD',
  intervalType: 'MONTHLY',
  intervalN: 3,
  startDate: new Date(2026, 0, 1).getTime(),
  assetAccountIds: ' funding , missing ',
};
const usage = { spent: 300, remaining: 600, budgetAmount: 900, usagePercent: 1 / 3 };
const accounts: PlainAccount[] = [
  {
    id: categoryId,
    name: 'Groceries',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    icon: Icon.ShoppingCart,
    color: '#336699',
  },
  {
    id: fundingId,
    name: 'Checking',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    icon: Icon.Bank,
    color: '#996633',
  },
];

describe('useBudgetListViewModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(budgetReadService.observeAllActive).mockReturnValue(of([budget]));
    jest.mocked(budgetReadService.observeBudgetUsage).mockReturnValue(of(usage));
    jest
      .mocked(budgetReadService.observeScopes)
      .mockReturnValue(of([{ budgetId: budget.id, accountId: categoryId }]));
    jest.mocked(accountQueries.observeAll).mockReturnValue(of(accounts));
  });

  it('compares the previous recurrence cycle instead of the previous calendar month', async () => {
    const now = new Date(2026, 8, 20).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const { result } = renderHook(() => useBudgetListViewModel(workplaceId));
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      const { startDate } = BudgetPeriodUtils.getCurrentPeriod(budget, now);
      expect(budgetReadService.observeBudgetUsage).toHaveBeenNthCalledWith(
        1,
        workplaceId,
        budget.id,
        now,
      );
      expect(budgetReadService.observeBudgetUsage).toHaveBeenNthCalledWith(
        2,
        workplaceId,
        budget.id,
        startDate - 1,
      );
      const previous = BudgetPeriodUtils.getCurrentPeriod(budget, startDate - 1);
      expect(previous.endDate).toBeLessThan(startDate);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('updates category and funding identity reactively without resubscribing to usage', async () => {
    const accountSource = new BehaviorSubject(accounts);
    jest.mocked(accountQueries.observeAll).mockReturnValue(accountSource);
    const { result } = renderHook(() => useBudgetListViewModel(workplaceId));
    await waitFor(() => expect(result.current.items[0]?.scopeAccounts).toEqual([accounts[0]]));
    expect(result.current.items[0]?.fundingAccounts).toEqual([accounts[1], undefined]);
    act(() =>
      accountSource.next(
        accounts.map(account => ({
          ...account,
          name: `${account.name} renamed`,
          color: '#663399',
          icon: Icon.Wallet,
        })),
      ),
    );
    await waitFor(() =>
      expect(result.current.items[0]?.scopeAccounts?.[0]).toMatchObject({
        name: 'Groceries renamed',
        color: '#663399',
        icon: Icon.Wallet,
      }),
    );
    expect(result.current.items[0]?.fundingAccounts?.[0]).toMatchObject({
      name: 'Checking renamed',
      color: '#663399',
      icon: Icon.Wallet,
    });
    expect(result.current.items[0]?.fundingAccounts?.[1]).toBeUndefined();
    expect(budgetReadService.observeBudgetUsage).toHaveBeenCalledTimes(2);
  });
});
