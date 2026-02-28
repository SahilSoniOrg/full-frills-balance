import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { DateRange, formatDate, getEndOfDay, getStartOfDay, PeriodFilter } from '@/src/utils/dateUtils';
import { Q } from '@nozbe/watermelondb';
import { useCallback, useMemo, useState } from 'react';

interface UseReportDateFilterProps {
    dateRange: DateRange;
    updateFilter: (range: DateRange, filter: PeriodFilter) => void;
    onResetSelections: () => void;
}

/**
 * Hook to manage report date range selection and picker state.
 */
export function useReportDateFilter({ dateRange, updateFilter, onResetSelections }: UseReportDateFilterProps) {
    const [showDatePicker, setShowDatePicker] = useState(false);

    const onDateSelect = useCallback(async (range: DateRange | null, filter: PeriodFilter) => {
        let finalRange = range;

        if (filter.type === 'ALL_TIME') {
            // Find earliest transaction to bound the "All Time" start date
            const earliest = await transactionRepository.transactionsQuery(
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('transaction_date', Q.asc),
                Q.take(1)
            ).fetch();

            const startTimestamp = earliest.length > 0 ? earliest[0].transactionDate : Date.now();
            finalRange = {
                startDate: getStartOfDay(startTimestamp),
                endDate: getEndOfDay(Date.now()),
                label: 'All Time'
            };
        }

        if (finalRange) {
            updateFilter(finalRange, filter);
        }
        setShowDatePicker(false);
        onResetSelections();
    }, [updateFilter, onResetSelections]);

    const onOpenDatePicker = useCallback(() => setShowDatePicker(true), []);
    const onCloseDatePicker = useCallback(() => setShowDatePicker(false), []);

    const dateLabel = useMemo(() => {
        return dateRange.label || `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`;
    }, [dateRange]);

    return {
        showDatePicker,
        onOpenDatePicker,
        onCloseDatePicker,
        onDateSelect,
        dateLabel,
    };
}
