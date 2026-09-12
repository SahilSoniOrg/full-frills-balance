import { Icon } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import type { FilterChromeModel } from '@/src/components/filters/filterChromeModel';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';
import { useReportDateFilter } from './useReportDateFilter';

export interface ReportFilters {
  filterChrome: {
    visible: boolean;
    onOpen: () => void;
    onClose: () => void;
    model: FilterChromeModel;
  };
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
  const [showFilterChrome, setShowFilterChrome] = useState(false);
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

  const openFilterChrome = useCallback(() => setShowFilterChrome(true), []);
  const closeFilterChrome = useCallback(() => setShowFilterChrome(false), []);

  const accountLabel =
    accountIds.length === 0
      ? AppConfig.strings.reports.allAccounts
      : AppConfig.strings.reports.accountCount(accountIds.length);

  const filterChromeModel = useMemo<FilterChromeModel>(
    () => ({
      title: AppConfig.strings.reports.filtersTitle,
      subtitle: AppConfig.strings.reports.filtersSubtitle,
      confirmLabel: AppConfig.strings.reports.applyFilters,
      items: [
        {
          id: 'report-date',
          kind: 'date',
          label: AppConfig.strings.reports.dateFilter,
          value: dateFilter.dateLabel,
          icon: Icon.Calendar,
          active: true,
          onPress: dateFilter.onOpenDatePicker,
          testID: 'reports-date-filter',
        },
        {
          id: 'report-accounts',
          kind: 'account',
          label: AppConfig.strings.reports.filterByAccounts,
          value: accountLabel,
          icon: Icon.Wallet,
          active: accountIds.length > 0,
          onPress: () => setShowAccountPicker(true),
          testID: 'reports-account-filter',
        },
      ],
    }),
    [accountIds.length, accountLabel, dateFilter.dateLabel, dateFilter.onOpenDatePicker],
  );

  return {
    filterChrome: {
      visible: showFilterChrome,
      onOpen: openFilterChrome,
      onClose: closeFilterChrome,
      model: filterChromeModel,
    },
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
