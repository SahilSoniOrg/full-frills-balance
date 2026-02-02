import {
    createDateRange,
    formatDate,
    formatRelativeTime,
    formatShortDate,
    formatTime,
    getCurrentMonthRange,
    getEndOfDay,
    getEndOfMonth,
    getEndOfWeek,
    getLastNRange,
    getMonthLabel,
    getMonthRange,
    getNextMonthRange,
    getPreviousMonthRange,
    getStartOfDay,
    getStartOfMonth,
    getStartOfWeek,
    isDateInRange
} from '@/src/utils/dateUtils';

describe('dateUtils', () => {
    const mockTimestamp = new Date('2024-03-15T12:00:00Z').getTime();

    describe('Formatting', () => {
        it('formatDate should return localized date string', () => {
            const date = new Date(mockTimestamp);
            expect(formatDate(mockTimestamp)).toBe(date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            }));
        });

        it('formatDate should include time when requested', () => {
            const date = new Date(mockTimestamp);
            expect(formatDate(mockTimestamp, { includeTime: true })).toBe(date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }));
        });

        it('formatShortDate should return MM/DD/YYYY', () => {
            // 2024-03-15
            expect(formatShortDate(mockTimestamp)).toBe('03/15/2024');
        });

        it('formatTime should return localized time string', () => {
            const date = new Date(mockTimestamp);
            expect(formatTime(mockTimestamp)).toBe(date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
            }));
        });

        describe('formatRelativeTime', () => {
            beforeEach(() => {
                jest.useFakeTimers();
                jest.setSystemTime(mockTimestamp);
            });

            afterEach(() => {
                jest.useRealTimers();
            });

            it('should return "Just now" for recent timestamps', () => {
                expect(formatRelativeTime(mockTimestamp - 1000)).toBe('Just now');
            });

            it('should return minutes ago', () => {
                expect(formatRelativeTime(mockTimestamp - (5 * 60 * 1000))).toBe('5 minutes ago');
                expect(formatRelativeTime(mockTimestamp - (1 * 60 * 1000))).toBe('1 minute ago');
            });

            it('should return hours ago', () => {
                expect(formatRelativeTime(mockTimestamp - (3 * 60 * 60 * 1000))).toBe('3 hours ago');
                expect(formatRelativeTime(mockTimestamp - (1 * 60 * 60 * 1000))).toBe('1 hour ago');
            });

            it('should return days ago', () => {
                expect(formatRelativeTime(mockTimestamp - (2 * 24 * 60 * 60 * 1000))).toBe('2 days ago');
                expect(formatRelativeTime(mockTimestamp - (1 * 24 * 60 * 60 * 1000))).toBe('1 day ago');
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

        it('getStartOfWeek should return Sunday midnight', () => {
            const start = getStartOfWeek(mockTimestamp);
            const date = new Date(start);
            expect(date.getDay()).toBe(0); // Sunday
            expect(date.getHours()).toBe(0);
        });

        it('getEndOfWeek should return Saturday 23:59:59.999', () => {
            const end = getEndOfWeek(mockTimestamp);
            const date = new Date(end);
            expect(date.getDay()).toBe(6); // Saturday
            expect(date.getHours()).toBe(23);
        });

        it('getStartOfMonth should return 1st day of month', () => {
            const start = getStartOfMonth(mockTimestamp);
            const date = new Date(start);
            expect(date.getDate()).toBe(1);
            expect(date.getHours()).toBe(0);
        });

        it('getEndOfMonth should return last day of month', () => {
            const end = getEndOfMonth(mockTimestamp);
            const date = new Date(end);
            // March has 31 days
            expect(date.getDate()).toBe(31);
            expect(date.getHours()).toBe(23);
        });
    });

    describe('Range Generation', () => {
        it('createDateRange should handle today', () => {
            const range = createDateRange('today', mockTimestamp);
            expect(range.startDate).toBe(getStartOfDay(mockTimestamp));
            expect(range.endDate).toBe(getEndOfDay(mockTimestamp));
        });

        it('createDateRange should handle month', () => {
            const range = createDateRange('month', mockTimestamp);
            expect(range.startDate).toBe(getStartOfMonth(mockTimestamp));
            expect(range.endDate).toBe(getEndOfMonth(mockTimestamp));
        });

        it('createDateRange should handle quarter', () => {
            const range = createDateRange('quarter', mockTimestamp);
            const start = new Date(range.startDate);
            const end = new Date(range.endDate);
            // March is in Q1 (Jan-Mar)
            expect(start.getMonth()).toBe(0); // Jan
            expect(start.getDate()).toBe(1);
            expect(end.getMonth()).toBe(2); // Mar
            expect(end.getDate()).toBe(31);
        });

        it('createDateRange should handle year', () => {
            const range = createDateRange('year', mockTimestamp);
            const start = new Date(range.startDate);
            const end = new Date(range.endDate);
            expect(start.getFullYear()).toBe(2024);
            expect(start.getMonth()).toBe(0);
            expect(end.getFullYear()).toBe(2024);
            expect(end.getMonth()).toBe(11);
        });

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

        it('isDateInRange should correctly validate', () => {
            const range = { startDate: 100, endDate: 200 };
            expect(isDateInRange(100, range)).toBe(true);
            expect(isDateInRange(150, range)).toBe(true);
            expect(isDateInRange(200, range)).toBe(true);
            expect(isDateInRange(99, range)).toBe(false);
            expect(isDateInRange(201, range)).toBe(false);
        });
    });
});
