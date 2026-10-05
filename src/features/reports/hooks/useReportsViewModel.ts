import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics';
import { AccountId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';
import {
  ReportOverviewTabVm,
  ReportSpendingTabVm,
  ReportTab,
  ReportWealthTabVm,
} from './reportTabTypes';
import { useReportFilters } from './useReportFilters';
import { useReportBreakdownDetails } from './useReportBreakdownDetails';
import { useReportChartData } from './useReportChartData';
import { calculateReportSummary } from '@/src/services/reports/reportSummary';

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

  const resetSelections = useCallback(() => {
    breakdownDetails.setExpandedExpenses(false);
  }, [breakdownDetails]);

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
