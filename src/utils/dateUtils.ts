/**
 * Centralized date formatting utilities
 * Provides consistent date handling across the app
 */

export interface DateRange {
  startDate: number;
  endDate: number;
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
  date.setMonth(date.getMonth() + 1, 0); // Next month, day 0
  date.setDate(0); // Last day of previous month
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
      quarterEnd.setDate(0);
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
 * Validates if a timestamp is within a date range
 * @param timestamp Timestamp to check
 * @param range Date range to validate against
 * @returns True if timestamp is within range (inclusive)
 */
export const isDateInRange = (timestamp: number, range: DateRange): boolean => {
  return timestamp >= range.startDate && timestamp <= range.endDate;
};
