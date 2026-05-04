import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { HeatmapPoint, SankeyData } from '@/src/services/report-service';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useCallback, useState } from 'react';
import { useReportActions } from './useReportActions';
import { useReportBreakdownDetails } from './useReportBreakdownDetails';
import { useReportChartData } from './useReportChartData';
import { useReportDateFilter } from './useReportDateFilter';

export type ReportTab = 'OVERVIEW' | 'SPENDING' | 'WEALTH';

export interface ReportsViewModel {
  activeTab: ReportTab;
  setActiveTab: (tab: ReportTab) => void;
  showAccountPicker: boolean;
  onOpenAccountPicker: () => void;
  onCloseAccountPicker: () => void;
  accountIds: string[];
  onAccountSelect: (ids: string[]) => void;
  showDatePicker: boolean;
  onOpenDatePicker: () => void;
  onCloseDatePicker: () => void;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  dateLabel: string;
  accounts: Account[]; // Repository return type varies
  loading: boolean;
  periodFilter: PeriodFilter;
  onRefresh: () => void;
  netWorthSeries: {
    x: number;
    y: number;
    date: number;
    netWorth: number;
    income: number;
    expense: number;
    assets: number;
    liabilities: number;
  }[];
  currentNetWorthText: string;
  incomeTotalText: string;
  expenseTotalText: string;
  incomeBarFlex: number;
  expenseBarFlex: number;
  expenseDonutData: { value: number; color: string; label: string }[];
  incomeDonutData: { value: number; color: string; label: string }[];
  legendRows: {
    id: string;
    color: string;
    accountName: string;
    percentage: number;
    amount: number;
  }[];
  incomeLegendRows: {
    id: string;
    color: string;
    accountName: string;
    percentage: number;
    amount: number;
  }[];
  hasExpenseData: boolean;
  hasIncomeData: boolean;
  barChartData: {
    label: string;
    values: number[];
    colors: string[];
    startDate: number;
    endDate: number;
  }[];
  selectedNetWorthIndex: number | undefined;
  onNetWorthPointSelect: (index: number) => void;
  selectedIncomeExpenseIndex: number | undefined;
  onIncomeExpensePointSelect: (index: number) => void;
  displayedNetWorthText: string;
  displayedIncomeText: string;
  displayedExpenseText: string;
  dailyData: {
    date: number;
    netWorth: number;
    income: number;
    expense: number;
    assets: number;
    liabilities: number;
  }[];
  onViewTransactions: (start: number, end?: number) => void;
  onViewSelectedTransactions: () => void;
  onLegendRowPress: (accountId: string) => void;

  // Advanced Charts
  wealthAreaSeries: { x: number; y: number }[][];
  selectedWealthIndex: number | undefined;
  onWealthPointSelect: (index: number) => void;
  sankeyData: SankeyData;
  spendingHeatmap: HeatmapPoint[];
  calendarHeatmap: HeatmapPoint[];

  // Expansion State
  expandedExpenses: boolean;
  toggleExpenseExpansion: () => void;
  expandedIncome: boolean;
  toggleIncomeExpansion: () => void;
  totalExpenseCount: number;
  totalIncomeCount: number;
  showExpenseExpansionButton: boolean;
  showIncomeExpansionButton: boolean;

  // Category Breakdown
  expenseCategoryViewState: {
    donutData: { value: number; color: string; label: string }[];
    legendRows: {
      id: string;
      color: string;
      accountName: string;
      percentage: number;
      amount: number;
    }[];
    totalCount: number;
    showExpansionButton: boolean;
    hasData: boolean;
  };
  incomeCategoryViewState: {
    donutData: { value: number; color: string; label: string }[];
    legendRows: {
      id: string;
      color: string;
      accountName: string;
      percentage: number;
      amount: number;
    }[];
    totalCount: number;
    showExpansionButton: boolean;
    hasData: boolean;
  };
  expandedExpenseCategories: boolean;
  expandedIncomeCategories: boolean;
  toggleExpenseCategoryExpansion: () => void;
  toggleIncomeCategoryExpansion: () => void;
  onCategoryPress: (category: string) => void;
  targetCurrency: string;
}

export function useReportsViewModel(): ReportsViewModel {
  const { theme } = useTheme();
  const { workplaceId } = useWorkplace();

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
  } = useReports(workplaceId);

  const [activeTab, setActiveTab] = useState<ReportTab>('OVERVIEW');
  const [showAccountPicker, setShowAccountPicker] = useState(false);

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
    selectedIncomeExpenseIndex: chartData.selectedIncomeExpenseIndex,
    targetCurrency,
    theme,
    workplaceId: workplaceId,
  });

  const resetSelections = useCallback(() => {
    chartData.setSelectedNetWorthIndex(undefined);
    chartData.setSelectedIncomeExpenseIndex(undefined);
    breakdownDetails.setExpandedExpenses(false);
    breakdownDetails.setExpandedIncome(false);
  }, [chartData, breakdownDetails]);

  const dateFilter = useReportDateFilter({
    workplaceId,
    dateRange,
    accountIds,
    updateFilter,
    onResetSelections: resetSelections,
  });

  const actions = useReportActions({
    selectedPeriod: breakdownDetails.selectedPeriod,
    dateRange,
  });

  const onRefresh = useCallback(() => {
    resetSelections();
    updateFilter({ ...dateRange }, { ...periodFilter }, [...accountIds]);
  }, [dateRange, periodFilter, accountIds, resetSelections, updateFilter]);

  const onAccountSelect = useCallback(
    (ids: string[]) => {
      updateFilter(dateRange, periodFilter, ids);
      setShowAccountPicker(false);
      resetSelections();
    },
    [dateRange, periodFilter, updateFilter, resetSelections],
  );

  return {
    // Tab State
    activeTab,
    setActiveTab,

    // Account Filter
    showAccountPicker,
    onOpenAccountPicker: () => setShowAccountPicker(true),
    onCloseAccountPicker: () => setShowAccountPicker(false),
    accountIds,
    onAccountSelect,

    // Date Filter
    showDatePicker: dateFilter.showDatePicker,
    onOpenDatePicker: dateFilter.onOpenDatePicker,
    onCloseDatePicker: dateFilter.onCloseDatePicker,
    onDateSelect: dateFilter.onDateSelect,
    dateLabel: dateFilter.dateLabel,

    // Reports state
    accounts,
    loading,
    periodFilter,
    onRefresh,

    // Chart Data
    netWorthSeries: chartData.netWorthSeries,
    currentNetWorthText: chartData.displayedNetWorthText,
    incomeTotalText: chartData.displayedIncomeText,
    expenseTotalText: chartData.displayedExpenseText,
    incomeBarFlex: incomeVsExpense.income || 1,
    expenseBarFlex: incomeVsExpense.expense || 1,
    barChartData: chartData.barChartData,
    selectedNetWorthIndex: chartData.selectedNetWorthIndex,
    onNetWorthPointSelect: chartData.onNetWorthPointSelect,
    selectedIncomeExpenseIndex: chartData.selectedIncomeExpenseIndex,
    onIncomeExpensePointSelect: chartData.onIncomeExpensePointSelect,
    displayedNetWorthText: chartData.displayedNetWorthText,
    displayedIncomeText: chartData.displayedIncomeText,
    displayedExpenseText: chartData.displayedExpenseText,
    dailyData: chartData.dailyData,

    // Breakdown Details
    expenseDonutData: breakdownDetails.expenseViewState.donutData,
    incomeDonutData: breakdownDetails.incomeViewState.donutData,
    legendRows: breakdownDetails.expenseViewState.legendRows,
    incomeLegendRows: breakdownDetails.incomeViewState.legendRows,
    hasExpenseData: breakdownDetails.expenseViewState.hasData,
    hasIncomeData: breakdownDetails.incomeViewState.hasData,
    expandedExpenses: breakdownDetails.expandedExpenses,
    toggleExpenseExpansion: breakdownDetails.toggleExpenseExpansion,
    expandedIncome: breakdownDetails.expandedIncome,
    toggleIncomeExpansion: breakdownDetails.toggleIncomeExpansion,
    totalExpenseCount: breakdownDetails.expenseViewState.totalCount,
    totalIncomeCount: breakdownDetails.incomeViewState.totalCount,
    showExpenseExpansionButton: breakdownDetails.expenseViewState.showExpansionButton,
    showIncomeExpansionButton: breakdownDetails.incomeViewState.showExpansionButton,

    // Advanced charts
    wealthAreaSeries: chartData.wealthAreaSeries,
    selectedWealthIndex: chartData.selectedWealthIndex,
    onWealthPointSelect: chartData.onWealthPointSelect,
    sankeyData: chartData.sankeyData,
    spendingHeatmap: chartData.spendingHeatmap,
    calendarHeatmap: chartData.calendarHeatmap,

    // Category Breakdown
    expenseCategoryViewState: breakdownDetails.expenseCategoryViewState,
    incomeCategoryViewState: breakdownDetails.incomeCategoryViewState,
    expandedExpenseCategories: breakdownDetails.expandedExpenseCategories,
    expandedIncomeCategories: breakdownDetails.expandedIncomeCategories,
    toggleExpenseCategoryExpansion: breakdownDetails.toggleExpenseCategoryExpansion,
    toggleIncomeCategoryExpansion: breakdownDetails.toggleIncomeCategoryExpansion,

    // Actions
    onViewTransactions: actions.onViewTransactions,
    onViewSelectedTransactions: actions.onViewSelectedTransactions,
    onLegendRowPress: actions.onLegendRowPress,
    onCategoryPress: actions.onCategoryPress,
    targetCurrency,
  };
}
