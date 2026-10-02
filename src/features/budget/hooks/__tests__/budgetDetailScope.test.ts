import { act, renderHook, waitFor } from '@/src/utils/test-utils';
import { of } from 'rxjs';
import { useBudgetDetailViewModel } from '../useBudgetDetailViewModel';
import { useJournalEntryList } from '@/src/features/journal';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountType, JournalStatus } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { AppNavigation } from '@/src/utils/navigation';

jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toSimpleJournalEntry: jest.fn() } }));

jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace', defaultCurrencyCode: 'USD' }),
}));
jest.mock('@/src/services/budget/budgetReadService', () => ({
  budgetReadService: {
    observeById: jest.fn(),
    observeBudgetUsage: jest.fn(),
    observeScopes: jest.fn(),
  },
}));
jest.mock('@/src/services/accounts/accountQueries', () => ({
  accountQueries: { observeByIds: jest.fn(), observeByType: jest.fn() },
}));
jest.mock('@/src/data/repositories/transaction', () => ({
  transactionQueryRepository: {
    observeBudgetTransactionsByJournalDateRange: jest.fn(),
  },
}));
jest.mock('@/src/services/budget/budgetCumulativeChartService', () => ({
  buildBudgetCumulativeChart: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/src/features/journal', () => ({
  useJournalEntryList: jest.fn(() => ({
    items: [],
    journals: [],
    isLoading: false,
    isLoadingMore: false,
    onEndReached: jest.fn(),
    selectedIds: new Set(),
    isSelectionModeActive: false,
    onLongPressItem: jest.fn(),
    exitSelectionMode: jest.fn(),
  })),
  useJournalsBulkOperations: () => ({ selectionChrome: {} }),
}));

const budgetId = 'budget' as BudgetId;
const parent = {
  id: 'food' as AccountId,
  name: 'Food',
  accountType: AccountType.EXPENSE,
  currencyCode: 'USD',
};
const leaf = { ...parent, id: 'dining' as AccountId, name: 'Dining', parentAccountId: parent.id };

describe('budget details read scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(transactionQueryRepository.observeBudgetTransactionsByJournalDateRange)
      .mockReturnValue(of([]));
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: budgetId });
    jest
      .mocked(budgetReadService.observeById)
      .mockReturnValue(of({ id: budgetId, name: 'Food', amount: 500, currencyCode: 'USD' }));
    jest
      .mocked(budgetReadService.observeBudgetUsage)
      .mockReturnValue(of({ spent: 150, remaining: 350, budgetAmount: 500, usagePercent: 0.3 }));
    jest
      .mocked(budgetReadService.observeScopes)
      .mockReturnValue(of([{ budgetId, accountId: parent.id }]));
    jest
      .mocked(accountQueries.observeByIds)
      .mockImplementation((_workplaceId: WorkplaceId, ids: AccountId[]) =>
        of(ids.includes(parent.id) ? [parent] : []),
      );
    jest.mocked(accountQueries.observeByType).mockReturnValue(of([parent, leaf]));
  });

  it('queries child expense legs and posted-equivalent statuses so activity matches usage', async () => {
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.scopeAccounts).toEqual([parent]));
    expect(useJournalEntryList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryOptions: { accountIds: [leaf.id] },
        expandScopedLegs: [leaf.id],
        statuses: [JournalStatus.POSTED, JournalStatus.REVERSED],
      }),
    );
    expect(result.current.onEndReached).toBeDefined();
  });

  it('shows a missing record instead of treating stale route preview values as a budget', async () => {
    jest
      .mocked(useLocalSearchParams)
      .mockReturnValue({ id: budgetId, pName: 'Deleted budget', pAmount: '500' });
    jest.mocked(budgetReadService.observeById).mockReturnValue(of(null));
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.isMissing).toBe(true));
    expect(result.current.budget).toBeNull();
  });

  it('filters activity without changing the budget summary and preselects the expense category', async () => {
    const other = { ...leaf, id: 'groceries' as AccountId, name: 'Groceries' };
    jest.mocked(accountQueries.observeByType).mockReturnValue(of([parent, leaf, other]));
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.expenseAccounts).toHaveLength(3));
    act(() => result.current.onFilterCategory(leaf.id));
    expect(result.current.activityCategory?.id).toBe(leaf.id);
    expect(result.current.usage?.spent).toBe(150);
    expect(useJournalEntryList).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryOptions: { accountIds: [leaf.id] } }),
    );
    act(() => result.current.onAddExpense());
    expect(AppNavigation.toSimpleJournalEntry).toHaveBeenCalledWith('expense', {
      destinationAccountId: leaf.id,
    });
    act(() => result.current.onFilterCategory(null));
    expect(useJournalEntryList).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryOptions: { accountIds: [leaf.id, other.id] } }),
    );
  });
});
