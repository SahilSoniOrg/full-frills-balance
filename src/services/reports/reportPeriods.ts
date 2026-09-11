import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';

/**
 * Returns the period immediately before the selected report period.
 * All-time has no finite equivalent period, so it intentionally returns null.
 */
export function getPreviousEquivalentReportRange(
  currentRange: DateRange,
  periodFilter: PeriodFilter,
): DateRange | null {
  if (periodFilter.type === 'ALL_TIME') return null;

  if (periodFilter.type === 'MONTH') {
    const previousMonth = dayjs(currentRange.startDate).subtract(1, 'month');
    return {
      startDate: previousMonth.startOf('month').valueOf(),
      endDate: previousMonth.endOf('month').valueOf(),
      label: previousMonth.format('MMM YYYY'),
    };
  }

  const currentStart = dayjs(currentRange.startDate).startOf('day');
  const currentEnd = dayjs(currentRange.endDate).startOf('day');
  const dayCount = currentEnd.diff(currentStart, 'day') + 1;
  if (dayCount <= 0) return null;

  const previousEnd = currentStart.subtract(1, 'day').endOf('day');
  const previousStart = previousEnd.startOf('day').subtract(dayCount - 1, 'day');

  return {
    startDate: previousStart.valueOf(),
    endDate: previousEnd.valueOf(),
    label: 'Previous period',
  };
}
