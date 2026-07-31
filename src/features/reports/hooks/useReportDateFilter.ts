import { AccountId, WorkplaceId } from '@/src/types/domain';
import { transactionReadService } from '@/src/services/transactions/transactionReadService';
import {
  DateRange,
  formatDate,
  getEndOfDay,
  getStartOfDay,
  PeriodFilter,
} from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';

interface UseReportDateFilterProps {
  dateRange: DateRange;
  accountIds: AccountId[];
  workplaceId: WorkplaceId;
  updateFilter: (range: DateRange, filter: PeriodFilter, accounts?: AccountId[]) => void;
  onResetSelections: () => void;
}

/**
 * Hook to manage report date range selection and picker state.
 */
export function useReportDateFilter({
  workplaceId,
  dateRange,
  accountIds,
  updateFilter,
  onResetSelections,
}: UseReportDateFilterProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDateSelect = useCallback(
    async (range: DateRange | null, filter: PeriodFilter) => {
      let finalRange = range;

      if (filter.type === 'ALL_TIME') {
        // Find earliest transaction to bound the "All Time" start date
        const earliest = await transactionReadService.findEarliest(workplaceId);
        const startTimestamp = earliest?.transactionDate ?? Date.now();
        finalRange = {
          startDate: getStartOfDay(startTimestamp),
          endDate: getEndOfDay(Date.now()),
          label: 'All Time',
        };
      }

      if (finalRange) {
        updateFilter(finalRange, filter, accountIds);
      }
      setShowDatePicker(false);
      onResetSelections();
    },
    [workplaceId, updateFilter, onResetSelections, accountIds],
  );

  const onOpenDatePicker = useCallback(() => setShowDatePicker(true), []);
  const onCloseDatePicker = useCallback(() => setShowDatePicker(false), []);

  const dateLabel = useMemo(() => {
    return (
      dateRange.label || `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`
    );
  }, [dateRange]);

  return {
    showDatePicker,
    onOpenDatePicker,
    onCloseDatePicker,
    onDateSelect,
    dateLabel,
  };
}
