import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics';
import { useCallback, useState } from 'react';
import {
  ReportOverviewTabVm,
  ReportSpendingTabVm,
  ReportTab,
  ReportWealthTabVm,
} from './reportTabTypes';
import { ReportFilters, useReportFilters } from './useReportFilters';
import { useReportActions } from './useReportActions';
import { useReportBreakdownDetails } from './useReportBreakdownDetails';
import { useReportChartData } from './useReportChartData';
import { calculateReportSummary } from '@/src/services/reports/reportSummary';

export interface ReportsViewModel {
  filters: ReportFilters;
  activeTab: ReportTab;
  setActiveTab: (tab: ReportTab) => void;
  loading: boolean;
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

  const actions = useReportActions({
    dateRange,
  });

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
    overview,
    spending,
    wealth,
  };
}
