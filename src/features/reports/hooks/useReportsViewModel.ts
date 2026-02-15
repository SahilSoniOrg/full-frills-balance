import { useReports } from '@/src/features/reports/hooks/useReports';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, PeriodFilter, formatDate } from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';

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
    legendRows: { id: string; color: string; accountName: string; percentage: number }[];
    hasExpenseData: boolean;
}

export function useReportsViewModel(): ReportsViewModel {
    const [showDatePicker, setShowDatePicker] = useState(false);

    const {
        netWorthHistory,
        expenses,
        incomeVsExpense,
        loading,
        dateRange,
        periodFilter,
        updateFilter,
    } = useReports();

    const onDateSelect = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        if (range) {
            updateFilter(range, filter);
        }
        setShowDatePicker(false);
    }, [updateFilter]);

    const onOpenDatePicker = useCallback(() => setShowDatePicker(true), []);
    const onCloseDatePicker = useCallback(() => setShowDatePicker(false), []);
    const onRefresh = useCallback(() => { }, []);

    const currentNetWorth = netWorthHistory.length > 0
        ? netWorthHistory[netWorthHistory.length - 1].netWorth
        : 0;

    const dateLabel = useMemo(() => {
        return dateRange.label || `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`;
    }, [dateRange]);

    const netWorthSeries = useMemo(
        () => netWorthHistory.map((point) => ({ x: point.date, y: point.netWorth })),
        [netWorthHistory]
    );

    const expenseDonutData = useMemo(
        () => expenses.map((expense) => ({ value: expense.amount, color: expense.color, label: expense.accountName })),
        [expenses]
    );

    const legendRows = useMemo(
        () => expenses.slice(0, 5).map((expense) => ({
            id: expense.accountId,
            color: expense.color,
            accountName: expense.accountName,
            percentage: Math.round(expense.percentage),
        })),
        [expenses]
    );

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
        expenseDonutData,
        legendRows,
        hasExpenseData: expenses.length > 0,
    };
}
