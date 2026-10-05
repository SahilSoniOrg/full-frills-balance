import { MultiAccountPickerModal } from '@/src/components/account-selection';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { AppConfig } from '@/src/constants';
import type { useReportFilters } from '@/src/features/reports/hooks/useReportFilters';

interface ReportFilterChromeProps {
  filters: ReturnType<typeof useReportFilters>;
}

export function ReportFilterChrome({ filters }: ReportFilterChromeProps) {
  const {
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
