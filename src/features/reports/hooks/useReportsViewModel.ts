import { useReports } from '@/src/features/reports/hooks/useReports';
import { useTheme } from '@/src/hooks/use-theme';
import { DateRange, PeriodFilter, formatDate } from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';

export interface ReportsViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
    showDatePicker: boolean;
    onOpenDatePicker: () => void;
    onCloseDatePicker: () => void;
    onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
    dateLabel: string;
    loading: boolean;
    netWorthHistory: ReturnType<typeof useReports>['netWorthHistory'];
    expenses: ReturnType<typeof useReports>['expenses'];
    incomeVsExpense: ReturnType<typeof useReports>['incomeVsExpense'];
    currentNetWorth: number;
    periodFilter: PeriodFilter;
    dateRange: DateRange;
    onRefresh: () => void;
}

export function useReportsViewModel(): ReportsViewModel {
    const { theme } = useTheme();
    const [showDatePicker, setShowDatePicker] = useState(false);

    const {
        netWorthHistory,
        expenses,
        incomeVsExpense,
        loading,
        dateRange,
        periodFilter,
        updateFilter
    } = useReports();

    const onDateSelect = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        if (range) {
            updateFilter(range, filter);
        }
        setShowDatePicker(false);
    }, [updateFilter]);

    const onOpenDatePicker = useCallback(() => {
        setShowDatePicker(true);
    }, []);

    const onCloseDatePicker = useCallback(() => {
        setShowDatePicker(false);
    }, []);

    const onRefresh = useCallback(() => { }, []);

    const currentNetWorth = netWorthHistory.length > 0
        ? netWorthHistory[netWorthHistory.length - 1].netWorth
        : 0;

    const dateLabel = useMemo(() => {
        return dateRange.label || `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`;
    }, [dateRange]);

    return {
        theme,
        showDatePicker,
        onOpenDatePicker,
        onCloseDatePicker,
        onDateSelect,
        dateLabel,
        loading,
        netWorthHistory,
        expenses,
        incomeVsExpense,
        currentNetWorth,
        periodFilter,
        dateRange,
        onRefresh,
    };
}
