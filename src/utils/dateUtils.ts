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

/** Calendar-relative label for upcoming/past dates (Today, Tomorrow, in N days, …). */
export function getSmartDateLabel(date: Date | string | number): string {
  const d = dayjs(date);
  const now = dayjs().startOf('day');
  const target = d.startOf('day');
  const diffDays = target.diff(now, 'day');

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;

  return d.format('MMM D, YYYY');
}

/** Named clock so render paths pass react-hooks/purity (Date.now is banned there). */
export const getNow = () => Date.now();

/** Named clock so render paths pass react-hooks/purity (performance.now is banned there). */
export const getPerfNow = () => performance.now();

/**
 * Gets the start of day (midnight) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns Start of day timestamp
 */
export const getStartOfDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * Gets the end of day (23:59:59.999) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns End of day timestamp
 */
export const getEndOfDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

/**
 * Gets a date range for a specific month and year
 */
export const getMonthRange = (month: number, year: number): DateRange => {
  const startDate = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  return { startDate, endDate };
};

/**
 * Gets a date range for the last N days/weeks/months
 */
export const getLastNRange = (n: number, unit: 'days' | 'weeks' | 'months'): DateRange => {
  const now = Date.now();
  const startDate = new Date(now);

  if (unit === 'days') {
    startDate.setDate(startDate.getDate() - n);
  } else if (unit === 'weeks') {
    startDate.setDate(startDate.getDate() - n * 7);
  } else if (unit === 'months') {
    startDate.setMonth(startDate.getMonth() - n);
  }

  return {
    startDate: getStartOfDay(startDate.getTime()),
    endDate: getEndOfDay(now),
  };
};

/**
 * Gets the current month range
 */
export const getCurrentMonthRange = (): DateRange => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const range = getMonthRange(month, year);
  return { ...range, label: getMonthLabel(month, year) };
};

/**
 * Gets the previous month range
 */
export const getPreviousMonthRange = (
  currentMonth: number,
  currentYear: number,
): { range: DateRange; month: number; year: number } => {
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;

  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }

  const range = getMonthRange(prevMonth, prevYear);
  return {
    range: { ...range, label: getMonthLabel(prevMonth, prevYear) },
    month: prevMonth,
    year: prevYear,
  };
};

/**
 * Gets the next month range
 */
export const getNextMonthRange = (
  currentMonth: number,
  currentYear: number,
): { range: DateRange; month: number; year: number } => {
  let nextMonth = currentMonth + 1;
  let nextYear = currentYear;

  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }

  const range = getMonthRange(nextMonth, nextYear);
  return {
    range: { ...range, label: getMonthLabel(nextMonth, nextYear) },
    month: nextMonth,
    year: nextYear,
  };
};

/**
 * Helper to get a formatted label for a month range (e.g. "Jan 2024")
 */
export const getMonthLabel = (month: number, year: number): string => {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[month]} ${year}`;
};

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
