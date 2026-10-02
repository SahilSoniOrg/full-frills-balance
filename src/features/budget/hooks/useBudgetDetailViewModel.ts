import { AppConfig } from '@/src/constants';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { resolveLeafExpenseAccountIds } from '@/src/services/budget/budgetCalculationHelpers';
import { parseBudgetAssetAccountIds } from '@/src/services/budget/budgetAssetAccountIds';
import {
  buildBudgetCumulativeChart,
  type BudgetCumulativeChart,
} from '@/src/services/budget/budgetCumulativeChartService';
import {
  useJournalEntryList,
  useJournalsBulkOperations,
  type JournalListModalsProps,
} from '@/src/features/journal';
import type { ListSelectionChrome } from '@/src/components/shared/SelectionActionBar';
import { useObservable, useObservableWithEnrichment } from '@/src/hooks/useObservable';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { analytics } from '@/src/services/analytics';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { BudgetUsage } from '@/src/services/budget/types';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { AccountType } from '@/src/types/enums';
import { AccountId, BudgetId, JournalId } from '@/src/types/ids';
import { PlainAccount, PlainBudget } from '@/src/types/plainDtos';
import { confirm } from '@/src/utils/alerts';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { combineLatest, of, switchMap } from 'rxjs';
import { JournalListItem } from '@/src/types/ui';

export interface BudgetDetailViewModel {
  budget: PlainBudget | null;
  usage: BudgetUsage | null;
  items: JournalListItem[];
  isLoading: boolean;
  isMissing: boolean;
  isLoadingActivity: boolean;
  isLoadingMore: boolean;
  onEndReached?: () => void;
  periodRange?: { startDate: number; endDate: number };
  scopeAccounts: PlainAccount[];
  fundingAccounts: PlainAccount[];
  isLoadingScope: boolean;
  isLoadingFunding: boolean;
  targetMonth: string;
  nextMonth: () => void;
  prevMonth: () => void;
  resetToToday: () => void;
  isCurrentMonth: boolean;
  chartData: BudgetCumulativeChart | null;
  isLoadingInsights: boolean;
  insightsError?: string;
  previousUsageError?: string;
  onRetryInsights: () => void;
  previousUsage: BudgetUsage | null;
  previousPeriodRange?: { startDate: number; endDate: number };
  expenseAccounts: PlainAccount[];
  activityCategory: PlainAccount | null;
  onFilterCategory: (id: AccountId | null) => void;
  onAddExpense: () => void;
  periodLabel: string;
  handleDelete: () => void;
  handleEdit: () => void;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  selectionChrome: ListSelectionChrome;
  modals?: JournalListModalsProps;
}

export function useBudgetDetailViewModel(): BudgetDetailViewModel {
  const { workplaceId } = useWorkplace();
  const { id: budgetId } = useLocalSearchParams<{ id: BudgetId }>();

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
    const { startDate, endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    return { startDate, endDate };
  }, [budget, refTimestamp]);

  const chartTransactions$ = useMemo(() => {
    if (!budgetDateRange || chartAccountIds.length === 0) return of([]);
    return transactionQueryRepository.observeBudgetTransactionsByJournalDateRange(
      workplaceId,
      chartAccountIds,
      budgetDateRange.startDate,
      budgetDateRange.endDate,
      ACTIVE_JOURNAL_STATUSES,
    );
  }, [budgetDateRange, chartAccountIds, workplaceId]);

  const previousPeriodRange = useMemo(
    () =>
      budget && budgetDateRange
        ? BudgetPeriodUtils.getCurrentPeriod(budget, budgetDateRange.startDate - 1)
        : undefined,
    [budget, budgetDateRange],
  );
  const {
    data: previousUsage,
    error: previousError,
    retry: retryPrevious,
  } = useObservable<BudgetUsage | null>(
    () =>
      budget && previousPeriodRange
        ? budgetReadService.observeBudgetUsage(
            workplaceId,
            budget.id,
            previousPeriodRange.startDate,
          )
        : of(null),
    [workplaceId, budget?.id, previousPeriodRange],
    null,
    { keepPreviousData: false },
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

  const journalContextVersion = useMemo(
    () =>
      journalList.journals
        .map(journal => `${journal.id}:${journal.journalDate}:${journal.currencyCode}`)
        .join('|'),
    [journalList.journals],
  );

  const {
    data: chartData,
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
      journalContextVersion,
    ],
    null,
    { keepPreviousData: false },
  );

  const displayedUsage = useMemo(() => {
    if (!usage || !chartData?.hasUnvaluedEntries || usage.hasUnvaluedEntries) return usage;
    return { ...usage, hasUnvaluedEntries: true };
  }, [chartData?.hasUnvaluedEntries, usage]);

  const nextMonth = useCallback(() => {
    if (!budget) return;
    const { startDate: nowStart } = BudgetPeriodUtils.getCurrentPeriod(budget);
    const { startDate: refStart } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    if (nowStart === refStart) return;

    const { endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    setRefTimestamp(endDate + 1);
  }, [budget, refTimestamp]);

  const prevMonth = useCallback(() => {
    if (!budget) return;
    const { startDate } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
    setRefTimestamp(startDate - 1);
  }, [budget, refTimestamp]);

  const resetToToday = useCallback(() => {
    setRefTimestamp(Date.now());
  }, []);

  const isCurrentMonth = useMemo(() => {
    if (!budget) return true;
    const { startDate } = BudgetPeriodUtils.getCurrentPeriod(budget);
    const { startDate: currentRefStart } = BudgetPeriodUtils.getCurrentPeriod(budget, refTimestamp);
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
          analytics.trackFeatureUsage('budget', 'delete', {
            budget_id: budget.id,
            currency: budget.currencyCode,
          });
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
    retryPrevious();
  }, [retryChart, retryPrevious]);
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
    isLoadingScope: isLoadingScopes || isLoadingScopeAccounts,
    isLoadingFunding,
    targetMonth: dayjs(refTimestamp).format('YYYY-MM'),
    nextMonth,
    prevMonth,
    resetToToday,
    isCurrentMonth,
    chartData,
    isLoadingInsights: isLoadingInsights || isLoadingScopes || isLoadingScopeAccounts,
    insightsError: chartError ? 'Could not load the spending breakdown.' : undefined,
    previousUsageError: previousError ? 'Previous period spending is unavailable.' : undefined,
    onRetryInsights,
    previousUsage,
    previousPeriodRange,
    expenseAccounts,
    activityCategory,
    onFilterCategory,
    onAddExpense,
    periodLabel: budget ? BudgetPeriodUtils.getPeriodLabel(budget, refTimestamp) : '',
    handleDelete,
    handleEdit,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    selectionChrome: bulkOperations.selectionChrome,
    modals: bulkOperations.modals,
  };
}
