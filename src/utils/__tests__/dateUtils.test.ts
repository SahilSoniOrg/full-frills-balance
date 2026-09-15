import {
  calendarClockTemplates,
  formatClockTime,
  formatDate,
  formatDateKeepingPattern,
  formatShortDate,
  getCurrentMonthRange,
  getEndOfDay,
  getLastNRange,
  getMonthLabel,
  getMonthRange,
  getNextMonthRange,
  getPreviousMonthRange,
  getSmartDateLabel,
  getStartOfDay,
} from '@/src/utils/dateUtils';

describe('dateUtils', () => {
  const mockTimestamp = new Date('2024-03-15T12:00:00Z').getTime();

  describe('Formatting', () => {
    it('formatDate should return localized date string', () => {
      const date = new Date(mockTimestamp);
      expect(formatDate(mockTimestamp)).toBe(
        date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      );
    });

    it('formatDate should include time when requested', () => {
      const date = new Date(mockTimestamp);
      expect(formatDate(mockTimestamp, { includeTime: true, hourCycle: '12-hour' })).toBe(
        date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      );
    });

    it('formatDate should use 24-hour clock when requested', () => {
      const date = new Date(mockTimestamp);
      expect(formatDate(mockTimestamp, { includeTime: true, hourCycle: '24-hour' })).toBe(
        date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      );
    });

    it('formatShortDate should return MM/DD/YYYY', () => {
      // 2024-03-15
      expect(formatShortDate(mockTimestamp)).toBe('03/15/2024');
    });

    it('formatClockTime formats 12-hour clocks without a padded hour', () => {
      const afternoon = new Date(2024, 2, 15, 14, 5);
      expect(formatClockTime(afternoon, '12-hour')).toBe('2:05 PM');
      expect(formatClockTime(afternoon, '24-hour')).toBe('14:05');
    });

    it('formatDateKeepingPattern keeps the date pattern and swaps only the clock', () => {
      const value = new Date(2024, 2, 15, 14, 5);
      expect(formatDateKeepingPattern(value, 'DD MMM YYYY', '24-hour')).toBe('15 Mar 2024, 14:05');
      expect(formatDateKeepingPattern(value, 'DD MMM YYYY', '12-hour')).toBe(
        '15 Mar 2024, 2:05 PM',
      );
    });

    it('calendarClockTemplates embeds matching clock tokens', () => {
      expect(calendarClockTemplates('12-hour').sameDay).toBe('[Today at] h:mm A');
      expect(calendarClockTemplates('24-hour').sameDay).toBe('[Today at] HH:mm');
    });

    describe('getSmartDateLabel', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('returns Today, Tomorrow, and Yesterday', () => {
        expect(getSmartDateLabel(new Date(2024, 2, 15))).toBe('Today');
        expect(getSmartDateLabel(new Date(2024, 2, 16))).toBe('Tomorrow');
        expect(getSmartDateLabel(new Date(2024, 2, 14))).toBe('Yesterday');
      });

      it('returns relative labels within a week', () => {
        expect(getSmartDateLabel(new Date(2024, 2, 18))).toBe('in 3 days');
        expect(getSmartDateLabel(new Date(2024, 2, 12))).toBe('3 days ago');
      });

      it('falls back to a calendar date outside a week', () => {
        expect(getSmartDateLabel(new Date(2024, 2, 1))).toBe('Mar 1, 2024');
      });
    });
  });

  describe('Day/Week/Month Boundaries', () => {
    it('getStartOfDay should reset time to midnight', () => {
      const start = getStartOfDay(mockTimestamp);
      const date = new Date(start);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
      expect(date.getMilliseconds()).toBe(0);
    });

    it('getEndOfDay should set time to 23:59:59.999', () => {
      const end = getEndOfDay(mockTimestamp);
      const date = new Date(end);
      expect(date.getHours()).toBe(23);
      expect(date.getMinutes()).toBe(59);
      expect(date.getSeconds()).toBe(59);
      expect(date.getMilliseconds()).toBe(999);
    });
  });

  describe('Range Generation', () => {
    it('getMonthRange should return correct boundaries', () => {
      const range = getMonthRange(1, 2024); // Feb 2024 (Leap year)
      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      expect(start.getMonth()).toBe(1);
      expect(start.getDate()).toBe(1);
      expect(end.getMonth()).toBe(1);
      expect(end.getDate()).toBe(29);
    });

    it('getLastNRange should work for days', () => {
      jest.useFakeTimers();
      jest.setSystemTime(mockTimestamp);
      const range = getLastNRange(7, 'days');
      const start = new Date(range.startDate);
      expect(start.getDate()).toBe(8); // 15 - 7
      jest.useRealTimers();
    });

    it('getCurrentMonthRange should use system time', () => {
      jest.useFakeTimers();
      jest.setSystemTime(mockTimestamp);
      const range = getCurrentMonthRange();
      expect(range.label).toBe('Mar 2024');
      expect(new Date(range.startDate).getMonth()).toBe(2);
      jest.useRealTimers();
    });

    it('getPreviousMonthRange should handle year rollover', () => {
      const { range, month, year } = getPreviousMonthRange(0, 2024); // Jan 2024
      expect(month).toBe(11);
      expect(year).toBe(2023);
      expect(range.label).toBe('Dec 2023');
    });

    it('getNextMonthRange should handle year rollover', () => {
      const { range, month, year } = getNextMonthRange(11, 2024); // Dec 2024
      expect(month).toBe(0);
      expect(year).toBe(2025);
      expect(range.label).toBe('Jan 2025');
    });
  });

  describe('Labels and Validation', () => {
    it('getMonthLabel should return MMM YYYY', () => {
      expect(getMonthLabel(0, 2024)).toBe('Jan 2024');
      expect(getMonthLabel(11, 2024)).toBe('Dec 2024');
    });
  });
});
