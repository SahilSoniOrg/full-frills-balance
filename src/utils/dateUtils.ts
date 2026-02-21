import { AppConfig } from '@/src/constants';
import * as Localization from 'expo-localization';

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
  } = {}
): string => {
  const { includeTime = false, locale = 'en-US' } = options;
  const timestamp = typeof value === 'number' ? value : value.getTime();
  const date = new Date(timestamp);

  if (includeTime) {
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

/**
 * Formats a timestamp as a time string (HH:MM AM/PM)
 * @param timestamp Unix timestamp in milliseconds
 * @returns Time string
 */
export const formatTime = (value: number | Date): string => {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formats a timestamp as a relative time string (e.g., "2 days ago")
 * @param timestamp Unix timestamp in milliseconds
 * @returns Relative time string
 */
export const formatRelativeTime = (value: number | Date): string => {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
};

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
 * Gets the start of week (Sunday midnight) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns Start of week timestamp
 */
export const getStartOfWeek = (timestamp: number): number => {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = day; // 0 = Sunday
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * Gets the end of week (Saturday 23:59:59.999) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns End of week timestamp
 */
export const getEndOfWeek = (timestamp: number): number => {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = 6 - day; // 6 = Saturday
  date.setDate(date.getDate() + diff);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

/**
 * Gets the start of month (1st day at midnight) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns Start of month timestamp
 */
export const getStartOfMonth = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * Gets the end of month (last day at 23:59:59.999) for a given timestamp
 * @param timestamp Unix timestamp in milliseconds
 * @returns End of month timestamp
 */
export const getEndOfMonth = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + 1, 0); // Next month, day 0 (which is last day of current month)
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

/**
 * Creates a date range for common periods
 * @param period Type of period ('today', 'week', 'month', 'quarter', 'year')
 * @param timestamp Reference timestamp (defaults to now)
 * @returns Date range object
 */
export const createDateRange = (
  period: 'today' | 'week' | 'month' | 'quarter' | 'year',
  timestamp: number = Date.now()
): DateRange => {
  const now = timestamp;
  const date = new Date(now);

  switch (period) {
    case 'today':
      return {
        startDate: getStartOfDay(now),
        endDate: getEndOfDay(now)
      };

    case 'week':
      return {
        startDate: getStartOfWeek(now),
        endDate: getEndOfWeek(now)
      };

    case 'month':
      return {
        startDate: getStartOfMonth(now),
        endDate: getEndOfMonth(now)
      };

    case 'quarter':
      const currentMonth = date.getMonth();
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      const quarterEndMonth = quarterStartMonth + 2;

      const quarterStart = new Date(now);
      quarterStart.setMonth(quarterStartMonth, 1);
      quarterStart.setHours(0, 0, 0, 0);

      const quarterEnd = new Date(now);
      quarterEnd.setMonth(quarterEndMonth + 1, 0); // Next month, day 0
      quarterEnd.setHours(23, 59, 59, 999);

      return {
        startDate: quarterStart.getTime(),
        endDate: quarterEnd.getTime()
      };

    case 'year':
      const yearStart = new Date(now);
      yearStart.setMonth(0, 1);
      yearStart.setHours(0, 0, 0, 0);

      const yearEnd = new Date(now);
      yearEnd.setMonth(11, 31); // December 31st
      yearEnd.setHours(23, 59, 59, 999);

      return {
        startDate: yearStart.getTime(),
        endDate: yearEnd.getTime()
      };

    default:
      return {
        startDate: getStartOfDay(now),
        endDate: getEndOfDay(now)
      };
  }
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
    startDate.setDate(startDate.getDate() - (n * 7));
  } else if (unit === 'months') {
    startDate.setMonth(startDate.getMonth() - n);
  }

  return {
    startDate: getStartOfDay(startDate.getTime()),
    endDate: getEndOfDay(now)
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
export const getPreviousMonthRange = (currentMonth: number, currentYear: number): { range: DateRange, month: number, year: number } => {
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;

  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }

  const range = getMonthRange(prevMonth, prevYear);
  return { range: { ...range, label: getMonthLabel(prevMonth, prevYear) }, month: prevMonth, year: prevYear };
};

/**
 * Gets the next month range
 */
export const getNextMonthRange = (currentMonth: number, currentYear: number): { range: DateRange, month: number, year: number } => {
  let nextMonth = currentMonth + 1;
  let nextYear = currentYear;

  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }

  const range = getMonthRange(nextMonth, nextYear);
  return { range: { ...range, label: getMonthLabel(nextMonth, nextYear) }, month: nextMonth, year: nextYear };
};

/**
 * Helper to get a formatted label for a month range (e.g. "Jan 2024")
 */
export const getMonthLabel = (month: number, year: number): string => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month]} ${year}`;
};

/**
 * Validates if a timestamp is within a date range
 * @param timestamp Timestamp to check
 * @param range Date range to validate against
 * @returns True if timestamp is within range (inclusive)
 */
export const isDateInRange = (timestamp: number, range: DateRange): boolean => {
  return timestamp >= range.startDate && timestamp <= range.endDate;
};

/**
 * Formats a timestamp for the day separator in lists (e.g. "Monday, Feb 23, 2026")
 */
export const formatDaySeparator = (timestamp: number, locale: string = Localization.getLocales()[0]?.languageTag || AppConfig.defaultLocale): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
