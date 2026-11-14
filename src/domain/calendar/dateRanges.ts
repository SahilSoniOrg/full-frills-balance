import dayjs from 'dayjs';

export interface DateRange {
  startDate: number;
  endDate: number;
  label?: string;
}

export type PeriodType = 'MONTH' | 'CUSTOM' | 'LAST_N' | 'ALL_TIME';

export interface PeriodFilter {
  type: PeriodType;
  month?: number; // 0-11
  year?: number;
  startDate?: number;
  endDate?: number;
  lastN?: number;
  lastNUnit?: 'days' | 'weeks' | 'months';
}

/**
 * Gets the start of day (midnight) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns Start of day timestamp
 */
export const getStartOfDay = (timestamp: number): number =>
  dayjs(timestamp).startOf('day').valueOf();

/**
 * Gets the end of day (23:59:59.999) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns End of day timestamp
 */
export const getEndOfDay = (timestamp: number): number => dayjs(timestamp).endOf('day').valueOf();

const monthStart = (month: number, year: number) => dayjs(new Date(year, month, 1));

/**
 * Gets a date range for a specific month and year
 */
export const getMonthRange = (month: number, year: number): DateRange => {
  const start = monthStart(month, year);
  return { startDate: start.valueOf(), endDate: start.endOf('month').valueOf() };
};

/**
 * Gets a date range for the last N days/weeks/months
 */
export const getLastNRange = (n: number, unit: 'days' | 'weeks' | 'months'): DateRange => {
  const now = dayjs();
  return {
    startDate: now.subtract(n, unit).startOf('day').valueOf(),
    endDate: now.endOf('day').valueOf(),
  };
};

/**
 * Gets the current month range
 */
export const getCurrentMonthRange = (): DateRange => {
  const now = dayjs();
  const range = getMonthRange(now.month(), now.year());
  return { ...range, label: getMonthLabel(now.month(), now.year()) };
};

const shiftedMonthRange = (
  currentMonth: number,
  currentYear: number,
  offset: number,
): { range: DateRange; month: number; year: number } => {
  const target = monthStart(currentMonth, currentYear).add(offset, 'month');
  const month = target.month();
  const year = target.year();
  return {
    range: { ...getMonthRange(month, year), label: getMonthLabel(month, year) },
    month,
    year,
  };
};

/**
 * Gets the previous month range
 */
export const getPreviousMonthRange = (currentMonth: number, currentYear: number) =>
  shiftedMonthRange(currentMonth, currentYear, -1);

/**
 * Gets the next month range
 */
export const getNextMonthRange = (currentMonth: number, currentYear: number) =>
  shiftedMonthRange(currentMonth, currentYear, 1);

export type PeriodRangeFacts = ReturnType<typeof describePeriodRange>;

/** Whole-calendar-day facts about a range as seen on `now`; both ends count as full days. */
export function describePeriodRange(range: DateRange, now: number) {
  const start = dayjs(range.startDate);
  const end = dayjs(range.endDate);
  const today = dayjs(now).startOf('day');
  const isCurrent = now >= range.startDate && now <= range.endDate;
  const periodDays = end.startOf('day').diff(start.startOf('day'), 'day') + 1;
  return {
    isCurrent,
    periodDays,
    daysRemaining: isCurrent ? end.startOf('day').diff(today, 'day') + 1 : 0,
    elapsedDays: Math.min(periodDays, Math.max(0, today.diff(start.startOf('day'), 'day') + 1)),
    dateRangeText: `${start.format('D MMM YYYY')} – ${end.format('D MMM YYYY')}`,
  };
}

/**
 * Helper to get a formatted label for a month range (e.g. "Jan 2024")
 */
export const getMonthLabel = (month: number, year: number): string =>
  monthStart(month, year).format('MMM YYYY');
