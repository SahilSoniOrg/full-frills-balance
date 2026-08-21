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
import { useSelectedReportPeriod } from './useSelectedReportPeriod';
export interface ReportSubPeriod {
  label: string | null;
  onClear: () => void;
}

export interface ReportsViewModel {
  filters: ReportFilters;
  subPeriod: ReportSubPeriod;
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
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | undefined>();

  const selectedPeriod = useSelectedReportPeriod({
    workplaceId,
    accountIds,
    targetCurrency,
    incomeVsExpenseHistory,
    selectedBarIndex,
    theme,
  });

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
    periodSnapshot: selectedPeriod.isActive ? selectedPeriod.snapshot : null,
    theme,
  });

  const clearSubPeriod = useCallback(() => {
    setSelectedBarIndex(undefined);
  }, []);

  const resetSelections = useCallback(() => {
    breakdownDetails.setExpandedExpenses(false);
    clearSubPeriod();
  }, [breakdownDetails, clearSubPeriod]);

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
    selectedPeriod: selectedPeriod.range,
    dateRange,
  });

  const onSelectBarIndex = useCallback((index: number | undefined) => {
    setSelectedBarIndex(index);
    if (index !== undefined && index !== -1) {
      analytics.logChartInteracted('income_expense', 'point_select');
    }
  }, []);

  const scopedIncomeExpense = selectedPeriod.isActive
    ? selectedPeriod.snapshot.incomeVsExpense
    : incomeVsExpense;

  const overview: ReportOverviewTabVm = {
    netWorthSeries: chartData.netWorthSeries,
    barChartData: chartData.barChartData,
    currentNetWorth: chartData.currentNetWorth,
    income: scopedIncomeExpense.income,
    expense: scopedIncomeExpense.expense,
    incomeBarFlex: scopedIncomeExpense.income || 1,
    expenseBarFlex: scopedIncomeExpense.expense || 1,
    sankeyData: selectedPeriod.isActive ? selectedPeriod.snapshot.sankeyData : chartData.sankeyData,
    targetCurrency,
    selectedBarIndex,
    onSelectBarIndex,
    onViewTransactions: actions.onViewTransactions,
    onViewSelectedTransactions: actions.onViewSelectedTransactions,
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
    subPeriod: {
      label: selectedPeriod.label,
      onClear: clearSubPeriod,
    },
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
