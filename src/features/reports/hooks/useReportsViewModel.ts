import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  mapAccountBreakdownToLegendEntry,
  mapCategoryBreakdownToLegendEntries,
  BreakdownLegendEntry,
} from '@/src/features/reports/hooks/breakdownLegendEntries';
import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics';
import { CategoryBreakdown, ExpenseCategory } from '@/src/services/reports/reportSnapshot';
import { calculateReportSummary } from '@/src/services/reports/reportSummary';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import {
  DateRange,
  formatDate,
  getEndOfDay,
  getStartOfDay,
  PeriodFilter,
} from '@/src/utils/dateUtils';
import { Theme } from '@/src/constants/design-tokens';
import { useCallback, useMemo, useState } from 'react';
import {
  ReportBreakdownViewState,
  ReportOverviewTabVm,
  ReportSpendingTabVm,
  ReportTab,
  ReportWealthTabVm,
} from './reportTabTypes';
import { useReportChartData } from './useReportChartData';

function buildBreakdownViewState({
  globalBreakdown,
  expanded,
  fallbackColor,
}: {
  globalBreakdown: BreakdownLegendEntry[];
  expanded: boolean;
  fallbackColor: string;
}): ReportBreakdownViewState {
  const displayLimit = expanded
    ? globalBreakdown.length
    : REPORT_CHART_LAYOUT.donutLegendCollapsedLimit;

  return {
    donutData: globalBreakdown
      .filter(entry => entry.amount > 0)
      .map(entry => ({
        value: entry.amount,
        color: entry.color || fallbackColor,
        label: entry.accountName,
      })),
    legendRows: globalBreakdown.slice(0, displayLimit).map(entry => ({
      id: entry.id,
      accountIds: entry.accountIds,
      color: entry.color || fallbackColor,
      accountName: entry.accountName,
      percentage: Math.round(entry.percentage),
      amount: entry.amount,
    })),
    hasData: globalBreakdown.length > 0,
    totalCount: globalBreakdown.length,
    showExpansionButton: globalBreakdown.length > REPORT_CHART_LAYOUT.donutLegendCollapsedLimit,
  };
}

function useReportBreakdownDetails({
  globalExpenses,
  expenseCategories,
  incomeCategories,
  theme,
}: {
  globalExpenses: ExpenseCategory[];
  expenseCategories: CategoryBreakdown[];
  incomeCategories: CategoryBreakdown[];
  theme: Theme;
}) {
  const [expandedExpenses, setExpandedExpenses] = useState(false);
  const [expandedExpenseCategories, setExpandedExpenseCategories] = useState(false);
  const [expandedIncomeCategories, setExpandedIncomeCategories] = useState(false);

  const toggleExpenseExpansion = () => setExpandedExpenses(prev => !prev);

  const expenseViewState = useMemo(
    () =>
      buildBreakdownViewState({
        globalBreakdown: globalExpenses.map(mapAccountBreakdownToLegendEntry),
        expanded: expandedExpenses,
        fallbackColor: theme.error,
      }),
    [expandedExpenses, globalExpenses, theme.error],
  );

  const expenseCategoryViewState = useMemo(
    () =>
      buildBreakdownViewState({
        globalBreakdown: mapCategoryBreakdownToLegendEntries(expenseCategories),
        expanded: expandedExpenseCategories,
        fallbackColor: theme.error,
      }),
    [expandedExpenseCategories, expenseCategories, theme.error],
  );

  const incomeCategoryViewState = useMemo(
    () =>
      buildBreakdownViewState({
        globalBreakdown: mapCategoryBreakdownToLegendEntries(incomeCategories),
        expanded: expandedIncomeCategories,
        fallbackColor: theme.success,
      }),
    [expandedIncomeCategories, incomeCategories, theme.success],
  );

  return {
    expandedExpenses,
    expandedExpenseCategories,
    expandedIncomeCategories,
    toggleExpenseExpansion,
    toggleExpenseCategoryExpansion: () => setExpandedExpenseCategories(prev => !prev),
    toggleIncomeCategoryExpansion: () => setExpandedIncomeCategories(prev => !prev),
    expenseViewState,
    expenseCategoryViewState,
    incomeCategoryViewState,
    setExpandedExpenses,
  };
}

function useReportFilters({
  accounts,
  workplaceId,
  dateRange,
  periodFilter,
  accountIds,
  updateFilter,
  onResetSelections,
}: {
  accounts: AccountFields[];
  workplaceId: WorkplaceId;
  dateRange: DateRange;
  periodFilter: PeriodFilter;
  accountIds: AccountId[];
  updateFilter: (range: DateRange, filter: PeriodFilter, accounts?: AccountId[]) => void;
  onResetSelections: () => void;
}) {
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDateSelect = useCallback(
    async (range: DateRange | null, filter: PeriodFilter) => {
      let finalRange = range;

      if (filter.type === 'ALL_TIME') {
        const earliest = await transactionQueryRepository.findEarliest(workplaceId);
        const startTimestamp = earliest?.transactionDate ?? Date.now();
        finalRange = {
          startDate: getStartOfDay(startTimestamp),
          endDate: getEndOfDay(Date.now()),
          label: 'All Time',
        };
      }

      if (finalRange) {
        updateFilter(finalRange, filter, accountIds);
      }
      setShowDatePicker(false);
      onResetSelections();
    },
    [workplaceId, updateFilter, onResetSelections, accountIds],
  );

  const onOpenDatePicker = useCallback(() => setShowDatePicker(true), []);
  const onCloseDatePicker = useCallback(() => setShowDatePicker(false), []);
  const onOpenAccountPicker = useCallback(() => setShowAccountPicker(true), []);
  const onCloseAccountPicker = useCallback(() => setShowAccountPicker(false), []);

  const dateLabel = useMemo(() => {
    return (
      dateRange.label || `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`
    );
  }, [dateRange]);

  const onRefresh = useCallback(() => {
    onResetSelections();
    updateFilter({ ...dateRange }, { ...periodFilter }, [...accountIds]);
  }, [dateRange, periodFilter, accountIds, onResetSelections, updateFilter]);

  const onAccountSelect = useCallback(
    (ids: AccountId[]) => {
      updateFilter(dateRange, periodFilter, ids);
      setShowAccountPicker(false);
      onResetSelections();
    },
    [dateRange, periodFilter, updateFilter, onResetSelections],
  );

  return {
    showAccountPicker,
    onOpenAccountPicker,
    onCloseAccountPicker,
    accountIds,
    onAccountSelect,
    showDatePicker,
    onOpenDatePicker,
    onCloseDatePicker,
    onDateSelect,
    dateLabel,
    accounts,
    periodFilter,
    onRefresh,
  };
}

export interface ReportsViewModel {
  filters: ReturnType<typeof useReportFilters>;
  activeTab: ReportTab;
  setActiveTab: (tab: ReportTab) => void;
  loading: boolean;
  hasUnvaluedEntries: boolean;
  overview: ReportOverviewTabVm;
  spending: ReportSpendingTabVm;
  wealth: ReportWealthTabVm;
}

export function useReportsViewModel(): ReportsViewModel {
  const { theme } = useTheme();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();

  const {
    accounts,
    netWorthHistory,
    expenses: globalExpenses,
    expenseCategories,
    incomeCategories,
    incomeVsExpenseHistory,
    incomeVsExpense,
    previousIncomeVsExpense,
    loading,
    targetCurrency,
    dateRange,
    periodFilter,
    accountIds,
    updateFilter,
    dailyIncomeVsExpense,
    sankeyData,
    spendingHeatmap,
    calendarHeatmap,
    hasUnvaluedEntries,
  } = useReports(workplaceId, defaultCurrencyCode);

  const [activeTab, setActiveTab] = useState<ReportTab>('OVERVIEW');

  const chartData = useReportChartData({
    netWorthHistory,
    incomeVsExpenseHistory,
    incomeVsExpense,
    dailyIncomeVsExpense,
    sankeyData,
    spendingHeatmap,
    calendarHeatmap,
    theme,
  });

  const breakdownDetails = useReportBreakdownDetails({
    globalExpenses,
    expenseCategories,
    incomeCategories,
    theme,
  });
  const { setExpandedExpenses } = breakdownDetails;

  const resetSelections = useCallback(() => {
    setExpandedExpenses(false);
  }, [setExpandedExpenses]);

  const filters = useReportFilters({
    accounts,
    workplaceId,
    dateRange,
    periodFilter,
    accountIds,
    updateFilter,
    onResetSelections: resetSelections,
  });

  const onViewTransactions = useCallback((start: number, end?: number) => {
    analytics.trackFeatureUsage('reports', 'drilldown_transactions');
    const startDate = new Date(start).setHours(0, 0, 0, 0);
    const endDate = end
      ? new Date(end).setHours(23, 59, 59, 999)
      : new Date(start).setHours(23, 59, 59, 999);

    AppNavigation.toJournalSearch({ startDate, endDate });
  }, []);

  const onViewCurrentTransactions = useCallback(
    (accountIds: AccountId[] = []) => {
      analytics.trackFeatureUsage('reports', 'drilldown_transactions');
      AppNavigation.toJournalSearch({
        ...(accountIds.length > 0 ? { accountIds } : {}),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
    },
    [dateRange.endDate, dateRange.startDate],
  );

  const onLegendRowPress = useCallback(
    (accountIds: AccountId[]) => {
      if (accountIds.length === 0) return;

      analytics.trackFeatureUsage('reports', 'drilldown_category', {
        account_count: accountIds.length,
      });

      AppNavigation.toJournalSearch({
        accountIds,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
    },
    [dateRange.endDate, dateRange.startDate],
  );

  const actions = { onViewTransactions, onViewCurrentTransactions, onLegendRowPress };

  const summaryData = calculateReportSummary({
    incomeVsExpense,
    previousIncomeVsExpense,
    expenseCategoryBreakdown: expenseCategories,
    dailyIncomeVsExpense,
  });
  const incomeAccountIds = Array.from(
    new Set(incomeCategories.flatMap(category => category.accountIds)),
  );
  const expenseAccountIds = Array.from(
    new Set(expenseCategories.flatMap(category => category.accountIds)),
  );
  const flowAccountIds = Array.from(new Set([...incomeAccountIds, ...expenseAccountIds]));

  const overview: ReportOverviewTabVm = {
    summary: {
      ...summaryData,
      onViewIncomeTransactions: () => actions.onViewCurrentTransactions(incomeAccountIds),
      onViewExpenseTransactions: () => actions.onViewCurrentTransactions(expenseAccountIds),
      onViewNetFlowTransactions: () => actions.onViewCurrentTransactions(flowAccountIds),
      onViewLargestCategoryTransactions: () =>
        actions.onViewCurrentTransactions(summaryData.largestSpendingCategory?.accountIds ?? []),
      onViewHighestSpendingDayTransactions: () =>
        summaryData.highestSpendingDay
          ? actions.onViewTransactions(summaryData.highestSpendingDay.date)
          : undefined,
    },
    netWorthSeries: chartData.netWorthSeries,
    currentNetWorth: chartData.currentNetWorth,
    income: incomeVsExpense.income,
    expense: incomeVsExpense.expense,
    incomeBarFlex: incomeVsExpense.income || 1,
    expenseBarFlex: incomeVsExpense.expense || 1,
    sankeyData: chartData.sankeyData,
    targetCurrency,
    onViewTransactions: actions.onViewTransactions,
  };

  const spending: ReportSpendingTabVm = {
    expenseViewState: breakdownDetails.expenseViewState,
    expenseCategoryViewState: breakdownDetails.expenseCategoryViewState,
    incomeCategoryViewState: breakdownDetails.incomeCategoryViewState,
    expandedExpenses: breakdownDetails.expandedExpenses,
    toggleExpenseExpansion: breakdownDetails.toggleExpenseExpansion,
    expandedExpenseCategories: breakdownDetails.expandedExpenseCategories,
    toggleExpenseCategoryExpansion: breakdownDetails.toggleExpenseCategoryExpansion,
    expandedIncomeCategories: breakdownDetails.expandedIncomeCategories,
    toggleIncomeCategoryExpansion: breakdownDetails.toggleIncomeCategoryExpansion,
    spendingHeatmap: chartData.spendingHeatmap,
    calendarHeatmap: chartData.calendarHeatmap,
    onLegendRowPress: actions.onLegendRowPress,
    targetCurrency,
  };

  const wealth: ReportWealthTabVm = {
    wealthAreaSeries: chartData.wealthAreaSeries,
    barChartData: chartData.barChartData,
    dailyData: chartData.dailyData,
    targetCurrency,
    onViewTransactions: actions.onViewTransactions,
  };

  return {
    filters,
    activeTab,
    setActiveTab: (tab: ReportTab) => {
      setActiveTab(tab);
      analytics.trackFeatureUsage('reports', 'change_tab', { tab });
    },
    loading,
    hasUnvaluedEntries,
    overview,
    spending,
    wealth,
  };
}
