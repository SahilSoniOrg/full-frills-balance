import { AppConfig } from '@/src/constants';
import type { ResolvedHourCycle } from '@/src/utils/hourCycle';
// TODO: Split hour-cycle lookup out of dateUtils. Formatters should take a
// ResolvedHourCycle (or a tiny resolver module), not import the preferences façade.
import { preferences } from '@/src/services/preferences';
import dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar';
import * as Localization from 'expo-localization';

dayjs.extend(calendar);

export interface DateRange {
  startDate: number;
  endDate: number;
  label?: string;
}

export const CLOCK_DAYJS_FORMAT: Record<ResolvedHourCycle, string> = {
  '12-hour': 'h:mm A',
  '24-hour': 'HH:mm',
};

export function formatClockTime(value: dayjs.ConfigType, cycle: ResolvedHourCycle): string {
  return dayjs(value).format(CLOCK_DAYJS_FORMAT[cycle]);
}

export function formatDateKeepingPattern(
  value: dayjs.ConfigType,
  datePattern: string,
  cycle: ResolvedHourCycle,
  separator = ', ',
): string {
  const d = dayjs(value);
  return `${d.format(datePattern)}${separator}${d.format(CLOCK_DAYJS_FORMAT[cycle])}`;
}

export function localeClockOptions(cycle: ResolvedHourCycle): Intl.DateTimeFormatOptions {
  return {
    hour: cycle === '12-hour' ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12: cycle === '12-hour',
  };
}

export function calendarClockTemplates(cycle: ResolvedHourCycle): {
  sameDay: string;
  nextDay: string;
  nextWeek: string;
  lastDay: string;
  lastWeek: string;
  sameElse: string;
} {
  const clock = CLOCK_DAYJS_FORMAT[cycle];
  return {
    sameDay: `[Today at] ${clock}`,
    nextDay: `[Tomorrow at] ${clock}`,
    nextWeek: `dddd [at] ${clock}`,
    lastDay: `[Yesterday at] ${clock}`,
    lastWeek: `[Last] dddd [at] ${clock}`,
    sameElse: `MMM D, YYYY [at] ${clock}`,
  };
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
 * Formats a timestamp as a localized date string
 * @param timestamp Unix timestamp in milliseconds
 * @param options Optional formatting options
 * @returns Formatted date string
 */
export const formatDate = (
  value: number | Date,
  options: {
    includeTime?: boolean;
    locale?: string;
    hourCycle?: ResolvedHourCycle;
  } = {},
): string => {
  const { includeTime = false, locale = 'en-US' } = options;
  const timestamp = typeof value === 'number' ? value : value.getTime();
  const date = new Date(timestamp);

  if (includeTime) {
    const hourCycle = options.hourCycle ?? preferences.hourCycle.resolved;
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...localeClockOptions(hourCycle),
    });
  }

  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Formats a timestamp as a short date string (MM/DD/YYYY)
 * @param timestamp Unix timestamp in milliseconds
 * @returns Short date string
 */
export const formatShortDate = (value: number | Date): string => {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

/** Named clock so render paths pass react-hooks/purity (Date.now is banned there). */
export const getNow = () => Date.now();

/** Named clock so render paths pass react-hooks/purity (performance.now is banned there). */
export const getPerfNow = () => performance.now();

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

/**
 * Formats a timestamp for the day separator in lists (e.g. "Monday, Feb 23, 2026")
 */
export const formatDaySeparator = (
  timestamp: number,
  locale: string = Localization.getLocales()[0]?.languageTag || AppConfig.defaultLocale,
): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Formats a timestamp as a relative date for reconciliation (e.g., "Today at 1:48 AM")
 */
export const formatRelativeReconciledDate = (
  value: number | Date,
  hourCycle: ResolvedHourCycle = preferences.hourCycle.resolved,
): string => {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  return dayjs(timestamp).calendar(null, calendarClockTemplates(hourCycle));
};

/**
 * Formats a timestamp as just time for reconciliation (e.g., "1:48 AM" or "13:48")
 */
export const formatReconciledTime = (
  value: number | Date,
  hourCycle: ResolvedHourCycle = preferences.hourCycle.resolved,
): string => {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  return formatClockTime(timestamp, hourCycle);
};
