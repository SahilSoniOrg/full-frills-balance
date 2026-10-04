import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import {
  DateRange,
  formatDate,
  getEndOfDay,
  getStartOfDay,
  PeriodFilter,
} from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';

export interface ReportFilters {
  showAccountPicker: boolean;
  onOpenAccountPicker: () => void;
  onCloseAccountPicker: () => void;
  accountIds: AccountId[];
  onAccountSelect: (ids: AccountId[]) => void;
  showDatePicker: boolean;
  onOpenDatePicker: () => void;
  onCloseDatePicker: () => void;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  dateLabel: string;
  accounts: AccountFields[];
  periodFilter: PeriodFilter;
  onRefresh: () => void;
}

interface UseReportFiltersProps {
  accounts: AccountFields[];
  workplaceId: WorkplaceId;
  dateRange: DateRange;
  periodFilter: PeriodFilter;
  accountIds: AccountId[];
  updateFilter: (range: DateRange, filter: PeriodFilter, accounts?: AccountId[]) => void;
  onResetSelections: () => void;
}

/**
 * Owns report date/account filter pickers and filter→reset side effects.
 */
export function useReportFilters({
  accounts,
  workplaceId,
  dateRange,
  periodFilter,
  accountIds,
  updateFilter,
  onResetSelections,
}: UseReportFiltersProps): ReportFilters {
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDateSelect = useCallback(
    async (range: DateRange | null, filter: PeriodFilter) => {
      let finalRange = range;

      if (filter.type === 'ALL_TIME') {
        const earliest = await transactionQueryRepository.findEarliest(workplaceId);
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

  const onRefresh = useCallback(() => {
    onResetSelections();
    updateFilter({ ...dateRange }, { ...periodFilter }, [...accountIds]);
  }, [dateRange, periodFilter, accountIds, onResetSelections, updateFilter]);

  const onAccountSelect = useCallback(
    (ids: AccountId[]) => {
      updateFilter(dateRange, periodFilter, ids);
      setShowAccountPicker(false);
      onResetSelections();
    },
    [dateRange, periodFilter, updateFilter, onResetSelections],
  );

  return {
    showAccountPicker,
    onOpenAccountPicker: () => setShowAccountPicker(true),
    onCloseAccountPicker: () => setShowAccountPicker(false),
    accountIds,
    onAccountSelect,
    showDatePicker,
    onOpenDatePicker,
    onCloseDatePicker,
    onDateSelect,
    dateLabel,
    accounts,
    periodFilter,
    onRefresh,
  };
}
