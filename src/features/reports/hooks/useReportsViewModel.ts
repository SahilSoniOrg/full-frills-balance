import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useCallback, useMemo, useState } from 'react';
import {
  ReportBreakdownViewState,
  ReportLegendRow,
  ReportOverviewTabVm,
  ReportSpendingTabVm,
  ReportTab,
  ReportWealthTabVm,
} from './reportTabTypes';
import { ReportFilters, useReportFilters } from './useReportFilters';
import { useReportActions } from './useReportActions';
import { useReportBreakdownDetails } from './useReportBreakdownDetails';
import { useReportChartData } from './useReportChartData';

export type { ReportTab } from './reportTabTypes';

export interface ReportsViewModel {
  filters: ReportFilters;
  activeTab: ReportTab;
  setActiveTab: (tab: ReportTab) => void;
  loading: boolean;
  /** Full currency format, privacy-aware. Owned by VM — Views pass this down. */
  formatMoney: (amount: number) => string;
  /** Short currency format, privacy-aware. Owned by VM — Views pass this down. */
  formatMoneyShort: (amount: number) => string;
  overview: ReportOverviewTabVm;
  spending: ReportSpendingTabVm;
  wealth: ReportWealthTabVm;
}

function withLegendAmountText(
  state: Omit<ReportBreakdownViewState, 'legendRows'> & {
    legendRows: Omit<ReportLegendRow, 'amountText'>[];
  },
  formatMoney: (amount: number) => string,
): ReportBreakdownViewState {
  return {
    ...state,
    legendRows: state.legendRows.map(row => ({
      ...row,
      amountText: formatMoney(row.amount),
    })),
  };
}

export function useReportsViewModel(): ReportsViewModel {
  const { theme } = useTheme();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { isPrivacyMode } = usePrivacyScope();

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
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | undefined>();

  const formatMoney = useCallback(
    (amount: number) => CurrencyFormatter.formatOrMask(amount, targetCurrency, isPrivacyMode),
    [targetCurrency, isPrivacyMode],
  );

  const formatMoneyShort = useCallback(
    (amount: number) => CurrencyFormatter.formatShortOrMask(amount, targetCurrency, isPrivacyMode),
    [targetCurrency, isPrivacyMode],
  );

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
    isPrivacyMode,
  });

  const breakdownDetails = useReportBreakdownDetails({
    globalExpenses,
    globalIncomeBreakdown,
    expenseCategories,
    incomeCategories,
    incomeVsExpenseHistory,
    selectedIncomeExpenseIndex: selectedBarIndex,
    targetCurrency,
    theme,
    workplaceId: workplaceId,
  });

  const resetSelections = useCallback(() => {
    breakdownDetails.setExpandedExpenses(false);
    breakdownDetails.setExpandedIncome(false);
    setSelectedBarIndex(undefined);
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

  const onSelectBarIndex = useCallback((index: number | undefined) => {
    setSelectedBarIndex(index);
    if (index !== undefined && index !== -1) {
      analytics.logChartInteracted('income_expense', 'point_select');
    }
  }, []);

  const overview: ReportOverviewTabVm = {
    netWorthSeries: chartData.netWorthSeries,
    barChartData: chartData.barChartData,
    displayedNetWorthText: chartData.displayedNetWorthText,
    displayedIncomeText: chartData.displayedIncomeText,
    displayedExpenseText: chartData.displayedExpenseText,
    incomeBarFlex: incomeVsExpense.income || 1,
    expenseBarFlex: incomeVsExpense.expense || 1,
    sankeyData: chartData.sankeyData,
    targetCurrency,
    selectedBarIndex,
    onSelectBarIndex,
    onViewTransactions: actions.onViewTransactions,
    onViewSelectedTransactions: actions.onViewSelectedTransactions,
  };

  const spending: ReportSpendingTabVm = useMemo(
    () => ({
      expenseViewState: withLegendAmountText(breakdownDetails.expenseViewState, formatMoney),
      expenseCategoryViewState: withLegendAmountText(
        breakdownDetails.expenseCategoryViewState,
        formatMoney,
      ),
      incomeCategoryViewState: withLegendAmountText(
        breakdownDetails.incomeCategoryViewState,
        formatMoney,
      ),
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
    }),
    [
      breakdownDetails.expenseViewState,
      breakdownDetails.expenseCategoryViewState,
      breakdownDetails.incomeCategoryViewState,
      breakdownDetails.expandedExpenses,
      breakdownDetails.toggleExpenseExpansion,
      breakdownDetails.expandedExpenseCategories,
      breakdownDetails.toggleExpenseCategoryExpansion,
      breakdownDetails.expandedIncomeCategories,
      breakdownDetails.toggleIncomeCategoryExpansion,
      chartData.spendingHeatmap,
      chartData.calendarHeatmap,
      actions.onLegendRowPress,
      actions.onCategoryPress,
      targetCurrency,
      formatMoney,
    ],
  );

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
    formatMoney,
    formatMoneyShort,
    overview,
    spending,
    wealth,
  };
}
