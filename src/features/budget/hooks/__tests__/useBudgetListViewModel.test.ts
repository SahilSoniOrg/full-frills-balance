import { act, renderHook, waitFor } from '@testing-library/react-native';
import { BehaviorSubject, of } from 'rxjs';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { asAccountId, asBudgetId, asWorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import type { PlainAccount, PlainBudget } from '@/src/types/plainDtos';
import { useBudgetListViewModel } from '../useBudgetListViewModel';
import { Icon } from '@/src/types/domainIcons';

jest.mock('@/src/services/accounts/accountQueries', () => ({
  accountQueries: { observeAll: jest.fn() },
}));
jest.mock('@/src/services/budget/budgetReadService', () => {
  const { budgetReadServiceJestModule } = jest.requireActual<
    typeof import('@/src/features/budget/testing/mockBudgetReadService')
  >('@/src/features/budget/testing/mockBudgetReadService');
  return budgetReadServiceJestModule;
});
const mockRateUpdates = new (jest.requireActual<typeof import('rxjs')>('rxjs').Subject)<string>();
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: { observeSpotRateUpdates: () => mockRateUpdates },
}));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toBudgetDetail: jest.fn() } }));

const workplaceId = asWorkplaceId('workplace');
const categoryId = asAccountId('category');
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

  it('observes usage once per budget for the current calendar day', async () => {
    const now = new Date(2026, 8, 20).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const { result } = renderHook(() => useBudgetListViewModel(workplaceId));
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      expect(budgetReadService.observeBudgetUsage).toHaveBeenCalledTimes(1);
      expect(budgetReadService.observeBudgetUsage).toHaveBeenCalledWith(
        workplaceId,
        budget.id,
        now,
      );
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('updates category identity reactively without resubscribing to usage', async () => {
    const accountSource = new BehaviorSubject(accounts);
    jest.mocked(accountQueries.observeAll).mockReturnValue(accountSource);
    const { result } = renderHook(() => useBudgetListViewModel(workplaceId));
    await waitFor(() => expect(result.current.items[0]?.scopeAccounts).toEqual([accounts[0]]));
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
    expect(budgetReadService.observeBudgetUsage).toHaveBeenCalledTimes(1);
  });

  it('exposes missing rate quotes and re-values budgets when rates update', async () => {
    const quote = { fromCurrency: 'EUR', toCurrency: 'USD', rateDate: 1 };
    jest
      .mocked(budgetReadService.observeBudgetUsage)
      .mockReturnValue(of({ ...usage, hasUnvaluedEntries: true, missingRateQuotes: [quote] }));
    const { result } = renderHook(() => useBudgetListViewModel(workplaceId, 'USD'));
    await waitFor(() => expect(result.current.missingRateQuotes).toEqual([quote]));
    const calls = jest.mocked(budgetReadService.observeBudgetUsage).mock.calls.length;
    act(() => mockRateUpdates.next('EUR'));
    await waitFor(() =>
      expect(jest.mocked(budgetReadService.observeBudgetUsage).mock.calls.length).toBeGreaterThan(
        calls,
      ),
    );
  });
});
