import { MultiAccountPickerModal } from '@/src/features/accounts';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { FilterChrome } from '@/src/components/filters/FilterChrome';
import { AppConfig } from '@/src/constants';
import type { ReportFilters } from '@/src/features/reports/hooks/useReportFilters';

interface ReportFilterChromeProps {
  filters: ReportFilters;
}

export function ReportFilterChrome({ filters }: ReportFilterChromeProps) {
  const {
    filterChrome,
    showDatePicker,
    onCloseDatePicker,
    onDateSelect,
    periodFilter,
    showAccountPicker,
    onCloseAccountPicker,
    onAccountSelect,
    accounts,
    accountIds,
  } = filters;

  return (
    <>
      <FilterChrome
        visible={filterChrome.visible}
        model={filterChrome.model}
        onClose={filterChrome.onClose}
      />

      <DateRangePicker
        visible={showDatePicker}
        onClose={onCloseDatePicker}
        onSelect={onDateSelect}
        currentFilter={periodFilter}
      />

      <MultiAccountPickerModal
        visible={showAccountPicker}
        onClose={onCloseAccountPicker}
        onSelect={onAccountSelect}
        accounts={accounts}
        selectedIds={accountIds}
        title={AppConfig.strings.reports.filterByAccounts}
      />
    </>
  );
}
