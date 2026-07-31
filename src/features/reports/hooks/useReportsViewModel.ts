import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
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
import { useReportOverviewTab } from './useReportOverviewTab';
import { useReportSpendingTab } from './useReportSpendingTab';
import { useReportWealthTab } from './useReportWealthTab';

export type { ReportTab } from './reportTabTypes';

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
    incomeBreakdown: globalIncomeBreakdown,
    expenseCategories,
    incomeCategories,
    incomeVsExpenseHistory,
    incomeVsExpense,
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
    workplaceId: workplaceId,
  });

  const breakdownDetails = useReportBreakdownDetails({
    globalExpenses,
    globalIncomeBreakdown,
    expenseCategories,
    incomeCategories,
    incomeVsExpenseHistory,
    targetCurrency,
    theme,
    workplaceId: workplaceId,
  });

  const resetSelections = useCallback(() => {
    breakdownDetails.setExpandedExpenses(false);
    breakdownDetails.setExpandedIncome(false);
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
    selectedPeriod: breakdownDetails.selectedPeriod,
    dateRange,
  });

  const overview = useReportOverviewTab({
    netWorthSeries: chartData.netWorthSeries,
    barChartData: chartData.barChartData,
    displayedNetWorthText: chartData.displayedNetWorthText,
    displayedIncomeText: chartData.displayedIncomeText,
    displayedExpenseText: chartData.displayedExpenseText,
    incomeBarFlex: incomeVsExpense.income || 1,
    expenseBarFlex: incomeVsExpense.expense || 1,
    sankeyData: chartData.sankeyData,
    targetCurrency,
    onViewTransactions: actions.onViewTransactions,
    onViewSelectedTransactions: actions.onViewSelectedTransactions,
  });

  const spending = useReportSpendingTab({
    expenseCategoryViewState: breakdownDetails.expenseCategoryViewState,
    incomeCategoryViewState: breakdownDetails.incomeCategoryViewState,
    expenseDonutData: breakdownDetails.expenseViewState.donutData,
    legendRows: breakdownDetails.expenseViewState.legendRows,
    totalExpenseCount: breakdownDetails.expenseViewState.totalCount,
    showExpenseExpansionButton: breakdownDetails.expenseViewState.showExpansionButton,
    expandedExpenses: breakdownDetails.expandedExpenses,
    toggleExpenseExpansion: breakdownDetails.toggleExpenseExpansion,
    expandedExpenseCategories: breakdownDetails.expandedExpenseCategories,
    toggleExpenseCategoryExpansion: breakdownDetails.toggleExpenseCategoryExpansion,
    expandedIncomeCategories: breakdownDetails.expandedIncomeCategories,
    toggleIncomeCategoryExpansion: breakdownDetails.toggleIncomeCategoryExpansion,
    spendingHeatmap: chartData.spendingHeatmap,
    calendarHeatmap: chartData.calendarHeatmap,
    onLegendRowPress: actions.onLegendRowPress,
    onCategoryPress: actions.onCategoryPress,
    targetCurrency,
  });

  const wealth = useReportWealthTab({
    wealthAreaSeries: chartData.wealthAreaSeries,
    barChartData: chartData.barChartData,
    dailyData: chartData.dailyData,
    targetCurrency,
    onViewTransactions: actions.onViewTransactions,
  });

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
