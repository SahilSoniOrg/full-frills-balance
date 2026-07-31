import Account from '@/src/data/models/Account';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useCallback, useState } from 'react';
import { useReportDateFilter } from './useReportDateFilter';

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
  accounts: Account[];
  periodFilter: PeriodFilter;
  onRefresh: () => void;
}

interface UseReportFiltersProps {
  accounts: Account[];
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

  const dateFilter = useReportDateFilter({
    workplaceId,
    dateRange,
    accountIds,
    updateFilter,
    onResetSelections,
  });

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
    showDatePicker: dateFilter.showDatePicker,
    onOpenDatePicker: dateFilter.onOpenDatePicker,
    onCloseDatePicker: dateFilter.onCloseDatePicker,
    onDateSelect: dateFilter.onDateSelect,
    dateLabel: dateFilter.dateLabel,
    accounts,
    periodFilter,
    onRefresh,
  };
}
