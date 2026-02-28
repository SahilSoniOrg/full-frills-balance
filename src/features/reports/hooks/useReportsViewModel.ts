import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useReportActions } from './useReportActions';
import { useReportBreakdownDetails } from './useReportBreakdownDetails';
import { useReportChartData } from './useReportChartData';
import { useReportDateFilter } from './useReportDateFilter';

export interface ReportsViewModel {
    showDatePicker: boolean;
    onOpenDatePicker: () => void;
    onCloseDatePicker: () => void;
    onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
    dateLabel: string;
    loading: boolean;
    periodFilter: PeriodFilter;
    onRefresh: () => void;
    netWorthSeries: { x: number; y: number }[];
    currentNetWorthText: string;
    incomeTotalText: string;
    expenseTotalText: string;
    incomeBarFlex: number;
    expenseBarFlex: number;
    expenseDonutData: { value: number; color: string; label: string }[];
    incomeDonutData: { value: number; color: string; label: string }[];
    legendRows: { id: string; color: string; accountName: string; percentage: number; amount: number }[];
    incomeLegendRows: { id: string; color: string; accountName: string; percentage: number; amount: number }[];
    hasExpenseData: boolean;
    hasIncomeData: boolean;
    barChartData: { label: string; values: number[]; colors: string[]; startDate: number; endDate: number }[];
    selectedNetWorthIndex: number | undefined;
    onNetWorthPointSelect: (index: number) => void;
    selectedIncomeExpenseIndex: number | undefined;
    onIncomeExpensePointSelect: (index: number) => void;
    displayedNetWorthText: string;
    displayedIncomeText: string;
    displayedExpenseText: string;
    dailyData: { date: number; netWorth: number; income: number; expense: number }[];
    onViewTransactions: (start: number, end?: number) => void;
    onViewSelectedTransactions: () => void;
    onLegendRowPress: (accountId: string) => void;

    // Expansion State
    expandedExpenses: boolean;
    toggleExpenseExpansion: () => void;
    expandedIncome: boolean;
    toggleIncomeExpansion: () => void;
    totalExpenseCount: number;
    totalIncomeCount: number;
    showExpenseExpansionButton: boolean;
    showIncomeExpansionButton: boolean;
}

export function useReportsViewModel(): ReportsViewModel {
    const { theme } = useTheme();
    const router = useRouter();

    const {
        netWorthHistory,
        expenses: globalExpenses,
        incomeBreakdown: globalIncomeBreakdown,
        incomeVsExpenseHistory,
        incomeVsExpense,
        loading,
        targetCurrency,
        dateRange,
        periodFilter,
        updateFilter,
        dailyIncomeVsExpense,
    } = useReports();

    const chartData = useReportChartData({
        netWorthHistory,
        incomeVsExpenseHistory,
        incomeVsExpense,
        dailyIncomeVsExpense,
        theme,
    });

    const breakdownDetails = useReportBreakdownDetails({
        globalExpenses,
        globalIncomeBreakdown,
        incomeVsExpenseHistory,
        selectedIncomeExpenseIndex: chartData.selectedIncomeExpenseIndex,
        targetCurrency,
        theme,
    });

    const resetSelections = useCallback(() => {
        chartData.setSelectedNetWorthIndex(undefined);
        chartData.setSelectedIncomeExpenseIndex(undefined);
        breakdownDetails.setExpandedExpenses(false);
        breakdownDetails.setExpandedIncome(false);
    }, [chartData, breakdownDetails]);

    const dateFilter = useReportDateFilter({
        dateRange,
        updateFilter,
        onResetSelections: resetSelections,
    });

    const actions = useReportActions({
        router,
        selectedPeriod: breakdownDetails.selectedPeriod,
        dateRange,
    });

    return {
        // Date Filter
        showDatePicker: dateFilter.showDatePicker,
        onOpenDatePicker: dateFilter.onOpenDatePicker,
        onCloseDatePicker: dateFilter.onCloseDatePicker,
        onDateSelect: dateFilter.onDateSelect,
        dateLabel: dateFilter.dateLabel,

        // Reports state
        loading,
        periodFilter,
        onRefresh: () => { },

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

        // Actions
        onViewTransactions: actions.onViewTransactions,
        onViewSelectedTransactions: actions.onViewSelectedTransactions,
        onLegendRowPress: actions.onLegendRowPress,
    };
}
