import { act, renderHook, waitFor } from '@/src/utils/test-utils';
import { BehaviorSubject, defer, of, Subject } from 'rxjs';
import dayjs from 'dayjs';
import { AppState } from 'react-native';
import type Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import { buildBudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import { budgetCumulativeChartFixture } from '@/src/features/budget/testing/budgetChartTestFixtures';
import { useBudgetDetailViewModel } from '../useBudgetDetailViewModel';
import { useJournalEntryList } from '@/src/features/journal';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, BudgetId, JournalId, WorkplaceId } from '@/src/types/ids';
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
jest.mock('@/src/data/repositories/journal/JournalObserveQueries', () => ({
  journalObserveQueries: { observeByIds: jest.fn() },
}));
jest.mock('@/src/data/repositories/journal/journalQueryRepository', () => ({
  journalQueryRepository: { findByIds: jest.fn() },
}));
jest.mock('@/src/services/currencyConversion', () => ({ convertJournalLineAmount: jest.fn() }));
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

function setupStandardBudgetDetailMocks() {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.mocked(journalObserveQueries.observeByIds).mockReturnValue(of([]));
  jest
    .mocked(buildBudgetCumulativeChart)
    .mockReset()
    .mockImplementation(async input =>
      budgetCumulativeChartFixture(input.periodStart, input.periodEnd),
    );
  jest
    .mocked(transactionQueryRepository.observeBudgetTransactionsByJournalDateRange)
    .mockReturnValue(of([]));
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: budgetId });
  jest.mocked(budgetReadService.observeById).mockReturnValue(
    of({
      id: budgetId,
      name: 'Food',
      amount: 500,
      currencyCode: 'USD',
      intervalType: 'MONTHLY',
    }),
  );
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
}

describe('budget details read scope', () => {
  beforeEach(() => setupStandardBudgetDetailMocks());
  afterEach(() => jest.restoreAllMocks());

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

const now = dayjs('2026-03-03T12:00:00').valueOf();
const marchStart = dayjs(now).startOf('month').valueOf();
const marchEnd = dayjs(now).endOf('month').valueOf();
const februaryStart = dayjs(now).subtract(1, 'month').startOf('month').valueOf();
const februaryEnd = dayjs(now).subtract(1, 'month').endOf('month').valueOf();
describe('budget details previous-period chart', () => {
  beforeEach(() => setupStandardBudgetDetailMocks());
  afterEach(() => jest.restoreAllMocks());

  it('uses the same full-scope journal query and chart builder for both periods', async () => {
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.previousComparisonSpent).toBe(90));
    for (const [start, end] of [
      [marchStart, marchEnd],
      [februaryStart, februaryEnd],
    ]) {
      expect(
        transactionQueryRepository.observeBudgetTransactionsByJournalDateRange,
      ).toHaveBeenCalledWith('workplace', [leaf.id], start, end, [
        JournalStatus.POSTED,
        JournalStatus.REVERSED,
      ]);
      expect(buildBudgetCumulativeChart).toHaveBeenCalledWith({
        workplaceId: 'workplace',
        transactions: [],
        accounts: [parent, parent, leaf],
        targetCurrency: 'USD',
        periodStart: start,
        periodEnd: end,
      });
    }
    expect(result.current.previousChartData?.domainX).toEqual([februaryStart, februaryEnd]);
    act(() => result.current.onFilterCategory(leaf.id));
    expect(result.current.previousComparisonSpent).toBe(90);
  });

  it('uses a full previous total for past periods and clears data while navigating', async () => {
    const januaryTransactions = new Subject<Transaction[]>();
    jest
      .mocked(transactionQueryRepository.observeBudgetTransactionsByJournalDateRange)
      .mockImplementation((_workplaceId, _ids, start) =>
        start < februaryStart ? januaryTransactions : of([]),
      );
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.previousComparisonSpent).toBe(90));
    act(() => result.current.prevMonth());
    await waitFor(() => expect(result.current.isCurrentPeriod).toBe(false));
    expect(result.current.previousChartData).toBeNull();
    expect(result.current.previousComparisonSpent).toBeNull();
    act(() => januaryTransactions.next([]));
    await waitFor(() => expect(result.current.previousComparisonSpent).toBe(300));
    expect(result.current.previousChartData?.domainX[0]).toBe(
      dayjs(februaryStart).subtract(1, 'month').valueOf(),
    );
  });

  it.each(['query', 'enrichment'] as const)(
    'hides stale comparison after %s failure, leaves main insights usable, and retries',
    async failure => {
      let previousTransactions = new BehaviorSubject<Transaction[]>([]);
      let shouldFail = false;
      jest
        .mocked(transactionQueryRepository.observeBudgetTransactionsByJournalDateRange)
        .mockImplementation((_workplaceId, _ids, start) =>
          start === februaryStart ? defer(() => previousTransactions) : of([]),
        );
      jest.mocked(buildBudgetCumulativeChart).mockImplementation(async input => {
        if (shouldFail && input.periodStart === februaryStart) throw new Error('Unavailable');
        return budgetCumulativeChartFixture(input.periodStart, input.periodEnd);
      });
      const { result } = renderHook(() => useBudgetDetailViewModel());
      await waitFor(() => expect(result.current.scopeAccounts).toEqual([parent]));
      act(() => previousTransactions.next([]));
      await waitFor(() => expect(result.current.previousComparisonSpent).toBe(90));
      if (failure === 'query') {
        act(() => previousTransactions.error(new Error('Unavailable')));
      } else {
        shouldFail = true;
        act(() => previousTransactions.next([]));
      }
      await waitFor(() => expect(result.current.previousChartData).toBeNull());
      expect(result.current.previousComparisonSpent).toBeNull();
      expect(result.current.chartData).not.toBeNull();
      expect(result.current.insightsError).toBeUndefined();
      shouldFail = false;
      previousTransactions = new BehaviorSubject<Transaction[]>([]);
      act(() => result.current.onRetryInsights());
      await waitFor(() => expect(result.current.previousComparisonSpent).toBe(90));
    },
  );

  it('rebuilds for previous journal date/currency edits without relying on Activity', async () => {
    const journalId = 'previous-journal' as JournalId;
    const transactions = [{ journalId }] as Transaction[];
    const journalContext = new Subject<Journal[]>();
    jest
      .mocked(transactionQueryRepository.observeBudgetTransactionsByJournalDateRange)
      .mockImplementation((_workplaceId, _ids, start) =>
        of(start === februaryStart ? transactions : []),
      );
    jest
      .mocked(journalObserveQueries.observeByIds)
      .mockImplementation((_workplaceId, ids) =>
        ids.includes(journalId) ? journalContext : of([]),
      );
    let sameDaySpend = 90;
    jest
      .mocked(buildBudgetCumulativeChart)
      .mockImplementation(async input =>
        budgetCumulativeChartFixture(input.periodStart, input.periodEnd, sameDaySpend),
      );
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() =>
      expect(journalObserveQueries.observeByIds).toHaveBeenCalledWith('workplace', [journalId]),
    );
    const journal = { id: journalId, journalDate: februaryStart, currencyCode: 'USD' } as Journal;
    act(() => journalContext.next([journal]));
    await waitFor(() => expect(result.current.previousComparisonSpent).toBe(90));
    // WatermelonDB can emit the same model/array after changing observed columns.
    journal.journalDate = dayjs(februaryStart).add(4, 'day').valueOf();
    journal.currencyCode = 'EUR';
    sameDaySpend = 42;
    act(() => journalContext.next([journal]));
    await waitFor(() => expect(result.current.previousComparisonSpent).toBe(42));
    expect(buildBudgetCumulativeChart).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions,
        targetCurrency: 'USD',
        periodStart: februaryStart,
      }),
    );
  });

  it('uses saved historical FX and journal dates for previous net spend, including refunds', async () => {
    const journalId = 'previous-journal' as JournalId;
    const journalDate = dayjs(februaryStart).add(2, 'day').hour(20).valueOf();
    const transactions = [
      {
        id: 'expense',
        journalId,
        accountId: leaf.id,
        amount: 80,
        currencyCode: 'EUR',
        exchangeRate: 2,
        transactionType: TransactionType.DEBIT,
        transactionDate: marchStart,
      },
      {
        id: 'refund',
        journalId,
        accountId: leaf.id,
        amount: 10,
        currencyCode: 'EUR',
        exchangeRate: 2,
        transactionType: TransactionType.CREDIT,
        transactionDate: marchStart,
      },
    ] as Transaction[];
    jest
      .mocked(transactionQueryRepository.observeBudgetTransactionsByJournalDateRange)
      .mockImplementation((_workplaceId, _ids, start) =>
        of(start === februaryStart ? transactions : []),
      );
    jest
      .mocked(journalQueryRepository.findByIds)
      .mockResolvedValue([{ id: journalId, journalDate, currencyCode: 'GBP' }] as Journal[]);
    jest.mocked(convertJournalLineAmount).mockImplementation(async input => ({
      ok: true,
      amount: input.amount * (input.storedLineRate ?? 1),
    }));
    // One integration case uses the real chart builder to exercise FX valuation.
    const realBuilder = jest.requireActual<
      typeof import('@/src/services/budget/budgetCumulativeChartService')
    >('@/src/services/budget/budgetCumulativeChartService').buildBudgetCumulativeChart;
    jest.mocked(buildBudgetCumulativeChart).mockImplementation(realBuilder);
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.previousComparisonSpent).toBe(140));
    expect(result.current.previousChartData?.data.at(-1)?.y).toBe(140);
    expect(result.current.previousChartData?.refunds).toBe(20);
    expect(convertJournalLineAmount).toHaveBeenCalledWith(
      expect.objectContaining({
        journalDate,
        lineCurrency: 'EUR',
        journalCurrency: 'GBP',
        targetCurrency: 'USD',
        storedLineRate: 2,
      }),
    );
  });

  it.each([false, true])(
    'propagates chart missing-FX metadata when usage incomplete is %s',
    async incomplete => {
      jest.mocked(budgetReadService.observeBudgetUsage).mockReturnValue(
        of({
          spent: 150,
          remaining: 350,
          budgetAmount: 500,
          usagePercent: 0.3,
          hasUnvaluedEntries: incomplete,
        }),
      );
      jest.mocked(buildBudgetCumulativeChart).mockImplementation(async input => ({
        ...budgetCumulativeChartFixture(input.periodStart, input.periodEnd),
        hasUnvaluedEntries: true,
        unvaluedEntryCount: 2,
        unvaluedCurrencyCounts: [{ currencyCode: 'EUR', count: 2 }],
      }));
      const { result } = renderHook(() => useBudgetDetailViewModel());
      await waitFor(() => expect(result.current.usage?.unvaluedEntryCount).toBe(2));
      expect(result.current.usage?.hasUnvaluedEntries).toBe(true);
      expect(result.current.usage?.unvaluedCurrencyCounts).toEqual([
        { currencyCode: 'EUR', count: 2 },
      ]);
      expect(result.current.usage?.spent).toBe(150);
    },
  );

  it('hides the previous chart and comparison when historical valuation is incomplete', async () => {
    jest.mocked(buildBudgetCumulativeChart).mockImplementation(async input => ({
      ...budgetCumulativeChartFixture(input.periodStart, input.periodEnd),
      hasUnvaluedEntries: input.periodStart === februaryStart,
      unvaluedEntryCount: input.periodStart === februaryStart ? 1 : 0,
    }));
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.chartData).not.toBeNull());
    expect(result.current.previousChartData).toBeNull();
    expect(result.current.previousComparisonSpent).toBeNull();
    expect(result.current.insightsError).toBeUndefined();
  });

  it('advances the comparison calendar day on foreground without rebuilding the full chart', async () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    const { result } = renderHook(() => useBudgetDetailViewModel());
    await waitFor(() => expect(result.current.previousComparisonSpent).toBe(90));
    const chartBuildCount = jest.mocked(buildBudgetCumulativeChart).mock.calls.length;
    act(() => {
      jest.mocked(Date.now).mockReturnValue(dayjs(now).add(1, 'day').valueOf());
      listener.mock.calls[0][1]('active');
    });
    expect(result.current.previousComparisonSpent).toBe(120);
    expect(buildBudgetCumulativeChart).toHaveBeenCalledTimes(chartBuildCount);
  });
});
