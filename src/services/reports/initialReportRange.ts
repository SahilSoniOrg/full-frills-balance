import { AppConfig } from '@/src/constants/app-config';
import type { DateRange } from '@/src/utils/dateUtils';

/** True when the latest activity falls outside the initially opened report window. */
export function shouldShiftInitialReportRange(
  initialRange: DateRange,
  latestJournalDate: number,
): boolean {
  return latestJournalDate < initialRange.startDate || latestJournalDate > initialRange.endDate;
}

/** Build a trailing window ending on the latest journal day (inclusive). */
export function rangeEndingOnLatestActivity(
  latestJournalDate: number,
  dayCount: number = AppConfig.defaults.reportDays,
): DateRange {
  const startDate = new Date(latestJournalDate);
  startDate.setDate(startDate.getDate() - dayCount);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(latestJournalDate);
  endDate.setHours(23, 59, 59, 999);
  return { startDate: startDate.getTime(), endDate: endDate.getTime() };
}
