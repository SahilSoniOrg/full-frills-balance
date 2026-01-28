/**
 * useDateRangeFilter - Hook for date range filter state management
 *
 * Encapsulates the common pattern of:
 * - Date range state
 * - Period filter state (month/year tracking)
 * - Date picker visibility
 * - Month navigation (previous/next)
 */
import {
    DateRange,
    PeriodFilter,
    getCurrentMonthRange,
    getNextMonthRange,
    getPreviousMonthRange,
} from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';

export interface UseDateRangeFilterResult {
    /** Current date range or null for "all time" */
    dateRange: DateRange | null;
    /** Current period filter */
    periodFilter: PeriodFilter;
    /** Whether the date picker modal is visible */
    isPickerVisible: boolean;
    /** Show the date picker */
    showPicker: () => void;
    /** Hide the date picker */
    hidePicker: () => void;
    /** Set both the date range and period filter */
    setFilter: (range: DateRange | null, filter: PeriodFilter) => void;
    /** Navigate to previous month (undefined if not a monthly filter) */
    navigatePrevious: (() => void) | undefined;
    /** Navigate to next month (undefined if not a monthly filter) */
    navigateNext: (() => void) | undefined;
}

export interface UseDateRangeFilterOptions {
    /** Default to current month (true) or all time (false) */
    defaultToCurrentMonth?: boolean;
}

/**
 * Hook to manage date range filter state with month navigation
 */
export function useDateRangeFilter(
    options: UseDateRangeFilterOptions = {}
): UseDateRangeFilterResult {
    const { defaultToCurrentMonth = true } = options;

    // Initial state based on options
    const [dateRange, setDateRange] = useState<DateRange | null>(() =>
        defaultToCurrentMonth ? getCurrentMonthRange() : null
    );

    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() => {
        if (defaultToCurrentMonth) {
            const now = new Date();
            return { type: 'MONTH', month: now.getMonth(), year: now.getFullYear() };
        }
        return { type: 'ALL_TIME' };
    });

    const [isPickerVisible, setIsPickerVisible] = useState(false);

    const showPicker = useCallback(() => setIsPickerVisible(true), []);
    const hidePicker = useCallback(() => setIsPickerVisible(false), []);

    const setFilter = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        setDateRange(range);
        setPeriodFilter(filter);
    }, []);

    // Month navigation handlers (only available for monthly filters)
    const navigatePrevious = useMemo(() => {
        if (periodFilter.type !== 'MONTH' || periodFilter.month === undefined || periodFilter.year === undefined) {
            return undefined;
        }
        return () => {
            const { range, month, year } = getPreviousMonthRange(periodFilter.month!, periodFilter.year!);
            setDateRange(range);
            setPeriodFilter({ type: 'MONTH', month, year });
        };
    }, [periodFilter]);

    const navigateNext = useMemo(() => {
        if (periodFilter.type !== 'MONTH' || periodFilter.month === undefined || periodFilter.year === undefined) {
            return undefined;
        }
        return () => {
            const { range, month, year } = getNextMonthRange(periodFilter.month!, periodFilter.year!);
            setDateRange(range);
            setPeriodFilter({ type: 'MONTH', month, year });
        };
    }, [periodFilter]);

    return {
        dateRange,
        periodFilter,
        isPickerVisible,
        showPicker,
        hidePicker,
        setFilter,
        navigatePrevious,
        navigateNext,
    };
}
