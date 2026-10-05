import { AppConfig } from '@/src/constants';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { getBudgetPreviousComparisonSpent } from '../helpers/budgetPreviousPeriod';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { resolveLeafExpenseAccountIds } from '@/src/services/budget/budgetCalculationHelpers';
import { parseBudgetAssetAccountIds } from '@/src/services/budget/budgetAssetAccountIds';
import { buildBudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import { useJournalEntryList, useJournalsBulkOperations } from '@/src/features/journal';
import { useObservable, useObservableWithEnrichment } from '@/src/hooks/useObservable';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import {
  getBudgetCurrentPeriod,
  getBudgetPeriodLabel,
} from '@/src/services/budget/BudgetPeriodUtils';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { AccountType } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { PlainBudget } from '@/src/types/plainDtos';
import { confirm } from '@/src/utils/alerts';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { combineLatest, map, of, switchMap } from 'rxjs';
/** Journal context must stay reactive independently of Activity's filter and pagination. */
function observeChartTransactions(
  workplaceId: WorkplaceId,
  accountIds: AccountId[],
  range: { startDate: number; endDate: number } | undefined,
) {
  if (!range || accountIds.length === 0) return of([]);
  return transactionQueryRepository
    .observeBudgetTransactionsByJournalDateRange(
      workplaceId,
      accountIds,
      range.startDate,
      range.endDate,
      ACTIVE_JOURNAL_STATUSES,
    )
    .pipe(
      switchMap(transactions =>
        journalObserveQueries
          .observeByIds(workplaceId, [...new Set(transactions.map(tx => tx.journalId))])
          .pipe(map(() => transactions)),
      ),
    );
}

export function useBudgetDetailViewModel() {
  const { workplaceId } = useWorkplace();
  const { id: budgetId } = useLocalSearchParams<{ id: BudgetId }>();
  const today = useCalendarDay();

  const [refTimestamp, setRefTimestamp] = useState(() => Date.now());
  const [activityCategoryId, setActivityCategoryId] = useState<AccountId | null>(null);

  const budgetData$ = useMemo(() => {
    return budgetReadService.observeById(workplaceId, budgetId).pipe(
      switchMap(budget => {
        if (!budget) return of(null);
        return combineLatest([
          of(budget),
          budgetReadService.observeBudgetUsage(workplaceId, budget.id, refTimestamp),
        ]);
      }),
    );
  }, [workplaceId, budgetId, refTimestamp]);

  const { data: dbBudgetData, isLoading: dbLoading } = useObservable(
    () => budgetData$,
    [workplaceId, budgetId, refTimestamp],
    null,
  );

  const { data: scopeRecords = [], isLoading: isLoadingScopes } = useObservable(
    () => (budgetId ? budgetReadService.observeScopes(workplaceId, budgetId) : of([])),
    [workplaceId, budgetId],
    [],
  );

  const budget: PlainBudget | null = dbBudgetData?.[0] ?? null;
  const usage = dbBudgetData?.[1] ?? null;

  const scopeAccountIds = useMemo(() => scopeRecords.map(scope => scope.accountId), [scopeRecords]);

  const { data: scopeAccounts = [], isLoading: isLoadingScopeAccounts } = useObservable(
    () => accountQueries.observeByIds(workplaceId, scopeAccountIds),
    [workplaceId, scopeAccountIds],
    [],
  );
  const fundingAccountIds = useMemo(
    () => parseBudgetAssetAccountIds(budget?.assetAccountIds),
    [budget?.assetAccountIds],
  );
  const { data: fundingAccounts = [], isLoading: isLoadingFunding } = useObservable(
    () => accountQueries.observeByIds(workplaceId, fundingAccountIds),
    [workplaceId, fundingAccountIds],
    [],
  );
  const { data: expenseAccounts = [] } = useObservable(
    () => accountQueries.observeByType(workplaceId, AccountType.EXPENSE),
    [workplaceId],
    [],
  );

  const chartAccountIds = useMemo(
    () => Array.from(resolveLeafExpenseAccountIds(scopeAccounts, expenseAccounts, workplaceId)),
    [scopeAccounts, expenseAccounts, workplaceId],
  );

  const budgetDateRange = useMemo(() => {
    if (!budget) return undefined;
    const { startDate, endDate } = getBudgetCurrentPeriod(budget, refTimestamp);
    return { startDate, endDate };
  }, [budget, refTimestamp]);

  const chartTransactions$ = useMemo(
    () => observeChartTransactions(workplaceId, chartAccountIds, budgetDateRange),
    [budgetDateRange, chartAccountIds, workplaceId],
  );

  const previousPeriodRange = useMemo(
    () =>
      budget && budgetDateRange
        ? getBudgetCurrentPeriod(budget, budgetDateRange.startDate - 1)
        : undefined,
    [budget, budgetDateRange],
  );
  const previousChartTransactions$ = useMemo(
    () => observeChartTransactions(workplaceId, chartAccountIds, previousPeriodRange),
    [previousPeriodRange, chartAccountIds, workplaceId],
  );
  const activityCategory =
    activityCategoryId && chartAccountIds.includes(activityCategoryId)
      ? (expenseAccounts.find(account => account.id === activityCategoryId) ?? null)
      : null;
  const activityAccountIds = useMemo(
    () => (activityCategory ? [activityCategory.id] : chartAccountIds),
    [activityCategory, chartAccountIds],
  );

  const journalList = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.pagination.budgetDetailsTransactionsPageSize,
    dateRange: budgetDateRange,
    statuses: [...ACTIVE_JOURNAL_STATUSES],
    queryOptions: { accountIds: activityAccountIds },
    expandScopedLegs: activityAccountIds.length > 0 ? activityAccountIds : undefined,
    paginationPolicy: 'always',
  });

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: journalList.journals,
    selection: journalList,
    onShareSelected: journalList.onShareSelected,
  });

  const {
    data: loadedChartData,
    isLoading: isLoadingInsights,
    error: chartError,
    retry: retryChart,
  } = useObservableWithEnrichment(
    () => chartTransactions$,
    transactions => {
      if (!budget || !budgetDateRange) return Promise.resolve(null);
      return buildBudgetCumulativeChart({
        workplaceId,
        transactions,
        accounts: [...scopeAccounts, ...expenseAccounts],
        targetCurrency: budget.currencyCode,
        periodStart: budgetDateRange.startDate,
        periodEnd: budgetDateRange.endDate,
      });
    },
    [
      chartTransactions$,
      budget?.id,
      budget?.currencyCode,
      budgetDateRange,
      workplaceId,
      scopeAccounts,
      expenseAccounts,
    ],
    null,
    { keepPreviousData: false },
  );
  const chartData = chartError ? null : loadedChartData;

  const {
    data: loadedPreviousChartData,
    isLoading: isLoadingPreviousChart,
    error: previousChartError,
    retry: retryPreviousChart,
  } = useObservableWithEnrichment(
    () => previousChartTransactions$,
    transactions => {
      if (!budget || !previousPeriodRange) return Promise.resolve(null);
      return buildBudgetCumulativeChart({
        workplaceId,
        transactions,
        accounts: [...scopeAccounts, ...expenseAccounts],
        targetCurrency: budget.currencyCode,
        periodStart: previousPeriodRange.startDate,
        periodEnd: previousPeriodRange.endDate,
      });
    },
    [
      previousChartTransactions$,
      budget?.id,
      budget?.currencyCode,
      previousPeriodRange,
      workplaceId,
      scopeAccounts,
      expenseAccounts,
    ],
    null,
    { keepPreviousData: false },
  );
  const previousChartData =
    previousChartError ||
    isLoadingPreviousChart ||
    loadedPreviousChartData?.hasUnvaluedEntries ||
    loadedPreviousChartData?.domainX[0] !== previousPeriodRange?.startDate ||
    loadedPreviousChartData?.domainX[1] !== previousPeriodRange?.endDate
      ? null
      : loadedPreviousChartData;
  const previousComparisonSpent = getBudgetPreviousComparisonSpent(
    previousChartData,
    budgetDateRange,
    previousPeriodRange,
    today,
  );

  const displayedUsage = useMemo(() => {
    if (!usage || !chartData?.hasUnvaluedEntries) return usage;
    return {
      ...usage,
      hasUnvaluedEntries: true,
      unvaluedEntryCount: chartData.unvaluedEntryCount ?? usage.unvaluedEntryCount,
      unvaluedCurrencyCounts: chartData.unvaluedCurrencyCounts ?? usage.unvaluedCurrencyCounts,
    };
  }, [chartData, usage]);

  const nextMonth = useCallback(() => {
    if (!budget) return;
    const { startDate: nowStart } = getBudgetCurrentPeriod(budget);
    const { startDate: refStart } = getBudgetCurrentPeriod(budget, refTimestamp);
    if (nowStart === refStart) return;

    const { endDate } = getBudgetCurrentPeriod(budget, refTimestamp);
    setRefTimestamp(endDate + 1);
  }, [budget, refTimestamp]);

  const prevMonth = useCallback(() => {
    if (!budget) return;
    const { startDate } = getBudgetCurrentPeriod(budget, refTimestamp);
    setRefTimestamp(startDate - 1);
  }, [budget, refTimestamp]);

  const resetToToday = useCallback(() => {
    setRefTimestamp(Date.now());
  }, []);

  const isCurrentPeriod = useMemo(() => {
    if (!budget) return true;
    const { startDate } = getBudgetCurrentPeriod(budget);
    const { startDate: currentRefStart } = getBudgetCurrentPeriod(budget, refTimestamp);
    return startDate === currentRefStart;
  }, [budget, refTimestamp]);

  const handleDelete = useCallback(() => {
    if (!budget) return;
    confirm.show({
      title: AppConfig.strings.budget.details.deleteTitle,
      message: AppConfig.strings.budget.details.deleteConfirm,
      confirmText: AppConfig.strings.common.delete,
      destructive: true,
      onConfirm: async () => {
        try {
          await budgetWriteService.deleteBudget(workplaceId, budget.id);
          AppNavigation.back();
        } catch (error: unknown) {
          logger.error(
            'Failed to delete budget',
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    });
  }, [budget, workplaceId]);

  const handleEdit = useCallback(() => {
    if (!budget) return;
    AppNavigation.toBudgetForm(budget.id, {
      name: budget.name,
      amount: budget.amount,
      currency: budget.currencyCode,
    });
  }, [budget]);

  const exitActivitySelection = journalList.exitSelectionMode;
  const onFilterCategory = useCallback(
    (id: AccountId | null) => {
      exitActivitySelection();
      setActivityCategoryId(id);
    },
    [exitActivitySelection],
  );
  const onRetryInsights = useCallback(() => {
    retryChart();
    retryPreviousChart();
  }, [retryChart, retryPreviousChart]);
  const onAddExpense = useCallback(() => {
    AppNavigation.toSimpleJournalEntry('expense', {
      destinationAccountId:
        activityCategory?.id ?? (chartAccountIds.length === 1 ? chartAccountIds[0] : undefined),
    });
  }, [activityCategory?.id, chartAccountIds]);

  return {
    budget,
    usage: displayedUsage,
    items: journalList.items,
    isLoading: dbLoading,
    isMissing: !dbLoading && !dbBudgetData,
    isLoadingActivity: journalList.isLoading,
    isLoadingMore: journalList.isLoadingMore,
    onEndReached: journalList.onEndReached,
    periodRange: budgetDateRange,
    scopeAccounts,
    fundingAccounts,
    isLoadingFunding,
    nextMonth,
    prevMonth,
    resetToToday,
    isCurrentPeriod,
    chartData,
    previousChartData,
    previousComparisonSpent,
    isLoadingInsights: isLoadingInsights || isLoadingScopes || isLoadingScopeAccounts,
    insightsError: chartError ? 'Could not load the spending breakdown.' : undefined,
    onRetryInsights,
    previousPeriodRange,
    expenseAccounts,
    activityCategory,
    onFilterCategory,
    onAddExpense,
    periodLabel: budget ? getBudgetPeriodLabel(budget, refTimestamp) : '',
    handleDelete,
    handleEdit,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    selectionChrome: bulkOperations.selectionChrome,
    modals: bulkOperations.modals,
  };
}

export type BudgetDetailViewModel = ReturnType<typeof useBudgetDetailViewModel>;
