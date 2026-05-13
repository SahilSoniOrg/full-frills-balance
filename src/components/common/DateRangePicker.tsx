import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateRangePickerView } from './DateRangePickerView';
import { useDateRangePicker } from './hooks/useDateRangePicker';

interface DateRangePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  currentFilter: PeriodFilter;
}

/**
 * DateRangePicker - Smart container for date range selection.
 * Orchestrates state via useDateRangePicker and delegates rendering to DateRangePickerView.
 */
export function DateRangePicker({
  visible,
  onClose,
  onSelect,
  currentFilter,
}: DateRangePickerProps) {
  const insets = useSafeAreaInsets();

  const pickerProps = useDateRangePicker({ visible, currentFilter, onSelect, onClose });

  return (
    <DateRangePickerView {...pickerProps} visible={visible} onClose={onClose} insets={insets} />
  );
}
