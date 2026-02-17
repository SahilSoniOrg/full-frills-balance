import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';
import { useBreakdownViewState } from '@/src/features/reports/hooks/useBreakdownViewState';
import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { ExpenseCategory, reportService } from '@/src/services/report-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, PeriodFilter, formatDate } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedNetWorthIndex, setSelectedNetWorthIndex] = useState<number | undefined>();
    const [selectedIncomeExpenseIndex, setSelectedIncomeExpenseIndex] = useState<number | undefined>();

    // Dynamic Breakdown State
    const [selectedExpenses, setSelectedExpenses] = useState<ExpenseCategory[] | null>(null);
    const [selectedIncome, setSelectedIncome] = useState<ExpenseCategory[] | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<{ start: number; end: number } | null>(null);
    const selectedBreakdownRequestId = useRef(0);

    // Expansion State
    const [expandedExpenses, setExpandedExpenses] = useState(false);
    const [expandedIncome, setExpandedIncome] = useState(false);

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

    const onDateSelect = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        if (range) {
            updateFilter(range, filter);
        }
        setShowDatePicker(false);
        // Reset selections on filter change
        setSelectedNetWorthIndex(undefined);
        setSelectedIncomeExpenseIndex(undefined);
        setSelectedPeriod(null);
        setExpandedExpenses(false);
        setExpandedIncome(false);
    }, [updateFilter]);

    const onOpenDatePicker = useCallback(() => setShowDatePicker(true), []);
    const onCloseDatePicker = useCallback(() => setShowDatePicker(false), []);
    const onRefresh = useCallback(() => { }, []);

    const toggleExpenseExpansion = useCallback(() => setExpandedExpenses(prev => !prev), []);
    const toggleIncomeExpansion = useCallback(() => setExpandedIncome(prev => !prev), []);

    const currentNetWorth = netWorthHistory.length > 0
        ? netWorthHistory[netWorthHistory.length - 1].netWorth
        : 0;

    // Selection Handlers
    const onNetWorthPointSelect = useCallback((index: number) => {
        setSelectedNetWorthIndex(prev => prev === index ? undefined : index); // Toggle
    }, []);

    const onIncomeExpensePointSelect = useCallback((index: number) => {
        setSelectedIncomeExpenseIndex(prev => prev === index ? undefined : index); // Toggle
    }, []);

    // Computed Display Values
    const displayedNetWorth = useMemo(() => {
        return currentNetWorth;
    }, [currentNetWorth]);

    const displayedIncome = useMemo(() => {
        if (selectedIncomeExpenseIndex !== undefined && incomeVsExpenseHistory[selectedIncomeExpenseIndex]) {
            return incomeVsExpenseHistory[selectedIncomeExpenseIndex].income;
        }
        return incomeVsExpense.income;
    }, [selectedIncomeExpenseIndex, incomeVsExpenseHistory, incomeVsExpense.income]);

    const displayedExpense = useMemo(() => {
        if (selectedIncomeExpenseIndex !== undefined && incomeVsExpenseHistory[selectedIncomeExpenseIndex]) {
            return incomeVsExpenseHistory[selectedIncomeExpenseIndex].expense;
        }
        return incomeVsExpense.expense;
    }, [selectedIncomeExpenseIndex, incomeVsExpenseHistory, incomeVsExpense.expense]);

    const dateLabel = useMemo(() => {
        return dateRange.label || `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`;
    }, [dateRange]);

    const netWorthSeries = useMemo(
        () => netWorthHistory.map((point) => ({ x: point.date, y: point.netWorth })),
        [netWorthHistory]
    );

    const dailyData = useMemo(() => {
        const incomeMap = new Map(dailyIncomeVsExpense.map(d => [d.date, d]));
        return netWorthHistory.map(point => {
            const dayData = incomeMap.get(point.date);
            return {
                date: point.date,
                netWorth: point.netWorth,
                income: dayData?.income || 0,
                expense: dayData?.expense || 0,
            };
        });
    }, [netWorthHistory, dailyIncomeVsExpense]);

    const expensePalette = useMemo(
        () => REPORT_CHART_COLOR_KEYS.expense.map((colorKey) => theme[colorKey]),
        [theme]
    );

    const incomePalette = useMemo(
        () => REPORT_CHART_COLOR_KEYS.income.map((colorKey) => theme[colorKey]),
        [theme]
    );

    // Fetch breakdown for selected period
    useEffect(() => {
        let isMounted = true;
        const requestId = ++selectedBreakdownRequestId.current;

        const fetchBreakdown = async () => {
            if (selectedIncomeExpenseIndex === undefined || !incomeVsExpenseHistory[selectedIncomeExpenseIndex]) {
                if (isMounted && selectedBreakdownRequestId.current === requestId) {
                    setSelectedExpenses(null);
                    setSelectedIncome(null);
                    setSelectedPeriod(null);
                    setExpandedExpenses(false);
                    setExpandedIncome(false);
                }
                return;
            }

            const item = incomeVsExpenseHistory[selectedIncomeExpenseIndex];
            const start = item.startDate;
            const end = item.endDate;

            if (isMounted) setSelectedPeriod({ start, end });

            try {
                const [exp, inc] = await Promise.all([
                    reportService.getExpenseBreakdown(start, end, targetCurrency),
                    reportService.getIncomeBreakdown(start, end, targetCurrency)
                ]);
                if (!isMounted || selectedBreakdownRequestId.current !== requestId) return;

                setSelectedExpenses(exp.map((e, index) => ({ ...e, color: expensePalette[index % expensePalette.length] })));
                setSelectedIncome(inc.map((incomeItem, index) => ({ ...incomeItem, color: incomePalette[index % incomePalette.length] })));
            } catch (error) {
                logger.error('[useReportsViewModel] Failed to fetch selected period breakdown', error, {
                    selectedIncomeExpenseIndex,
                    start,
                    end,
                });
                if (!isMounted || selectedBreakdownRequestId.current !== requestId) return;
                setSelectedExpenses(null);
                setSelectedIncome(null);
                setSelectedPeriod(null);
                setExpandedExpenses(false);
                setExpandedIncome(false);
            }
        };

        fetchBreakdown();
        return () => { isMounted = false; };
    }, [
        selectedIncomeExpenseIndex,
        incomeVsExpenseHistory,
        expensePalette,
        incomePalette,
        targetCurrency,
    ]);

    const expenseViewState = useBreakdownViewState({
        globalBreakdown: globalExpenses,
        selectedBreakdown: selectedExpenses,
        expanded: expandedExpenses,
        fallbackColor: theme.error,
    });
    const incomeViewState = useBreakdownViewState({
        globalBreakdown: globalIncomeBreakdown,
        selectedBreakdown: selectedIncome,
        expanded: expandedIncome,
        fallbackColor: theme.success,
    });

    const barChartData = useMemo(() => {
        return incomeVsExpenseHistory.map(item => ({
            label: item.period,
            values: [item.income, item.expense],
            colors: [theme.success, theme.error],
            startDate: item.startDate,
            endDate: item.endDate,
        }));
    }, [incomeVsExpenseHistory, theme.success, theme.error]);

    const hasExpenseData = expenseViewState.hasData;
    const hasIncomeData = incomeViewState.hasData;

    const onViewTransactions = useCallback((start: number, end?: number) => {
        const startDate = new Date(start).setHours(0, 0, 0, 0);
        const endDate = end
            ? new Date(end).setHours(23, 59, 59, 999)
            : new Date(start).setHours(23, 59, 59, 999);

        router.push({
            pathname: '/journal',
            params: { startDate: startDate.toString(), endDate: endDate.toString() }
        });
    }, [router]);

    const onViewSelectedTransactions = useCallback(() => {
        if (selectedPeriod) {
            onViewTransactions(selectedPeriod.start, selectedPeriod.end);
        }
    }, [selectedPeriod, onViewTransactions]);

    const onLegendRowPress = useCallback((accountId: string) => {
        const start = selectedPeriod?.start ?? dateRange.startDate;
        const end = selectedPeriod?.end ?? dateRange.endDate;

        router.push({
            pathname: '/account-details',
            params: {
                accountId,
                startDate: start.toString(),
                endDate: end.toString(),
            },
        });
    }, [dateRange.endDate, dateRange.startDate, router, selectedPeriod]);

    return {
        showDatePicker,
        onOpenDatePicker,
        onCloseDatePicker,
        onDateSelect,
        dateLabel,
        loading,
        periodFilter,
        onRefresh,
        netWorthSeries,
        currentNetWorthText: CurrencyFormatter.formatWithPreference(currentNetWorth),
        incomeTotalText: CurrencyFormatter.formatWithPreference(incomeVsExpense.income),
        expenseTotalText: CurrencyFormatter.formatWithPreference(incomeVsExpense.expense),
        incomeBarFlex: incomeVsExpense.income || 1,
        expenseBarFlex: incomeVsExpense.expense || 1,
        expenseDonutData: expenseViewState.donutData,
        incomeDonutData: incomeViewState.donutData,
        legendRows: expenseViewState.legendRows,
        incomeLegendRows: incomeViewState.legendRows,
        hasExpenseData,
        hasIncomeData,
        barChartData,
        selectedNetWorthIndex,
        onNetWorthPointSelect,
        selectedIncomeExpenseIndex,
        onIncomeExpensePointSelect,
        displayedNetWorthText: CurrencyFormatter.formatWithPreference(displayedNetWorth),
        displayedIncomeText: CurrencyFormatter.formatWithPreference(displayedIncome),
        displayedExpenseText: CurrencyFormatter.formatWithPreference(displayedExpense),
        dailyData,
        onViewTransactions,
        onViewSelectedTransactions,
        onLegendRowPress,
        expandedExpenses,
        toggleExpenseExpansion,
        expandedIncome,
        toggleIncomeExpansion,
        totalExpenseCount: expenseViewState.totalCount,
        totalIncomeCount: incomeViewState.totalCount,
        showExpenseExpansionButton: expenseViewState.showExpansionButton,
        showIncomeExpansionButton: incomeViewState.showExpansionButton,
    };
}
