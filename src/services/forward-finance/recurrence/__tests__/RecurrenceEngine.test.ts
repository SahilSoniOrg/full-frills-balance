import dayjs from 'dayjs';
import { RecurrenceEngine } from '../RecurrenceEngine';

describe('RecurrenceEngine', () => {
  describe('getOccurrenceOnOrAfter', () => {
    const date = (s: string) => dayjs(s).startOf('day').valueOf();

    it.each([2, 3, 7])(
      'preserves the anchor for every %s weeks when editing an old rule',
      count => {
        const start = date('2026-01-05');
        const reference = date('2026-10-04');
        const occurrence = RecurrenceEngine.getOccurrenceOnOrAfter(
          start,
          {
            intervalType: 'WEEKLY',
            intervalN: count,
            recurrenceDay: 1,
          },
          reference,
        );
        expect(occurrence).toBeGreaterThanOrEqual(reference);
        expect(dayjs(occurrence).day()).toBe(1);
        expect(dayjs(occurrence).diff(dayjs(start), 'day') % (7 * count)).toBe(0);
        expect(dayjs(occurrence).subtract(count, 'week').valueOf()).toBeLessThan(reference);
      },
    );

    it('keeps a three-month day-31 rule through short months', () => {
      const rule = { intervalType: 'MONTHLY', intervalN: 3, recurrenceDay: 31 };
      const start = date('2026-01-31');
      expect(
        dayjs(RecurrenceEngine.getOccurrenceOnOrAfter(start, rule, date('2026-04-30'))).format(
          'YYYY-MM-DD',
        ),
      ).toBe('2026-04-30');
      expect(
        dayjs(RecurrenceEngine.getOccurrenceOnOrAfter(start, rule, date('2026-05-01'))).format(
          'YYYY-MM-DD',
        ),
      ).toBe('2026-07-31');
    });

    it('does not move a future first occurrence backward', () => {
      const first = date('2027-01-05');
      expect(
        RecurrenceEngine.getOccurrenceOnOrAfter(
          first,
          {
            intervalType: 'MONTHLY',
            intervalN: 2,
            recurrenceDay: 5,
          },
          date('2026-10-04'),
        ),
      ).toBe(first);
    });
  });
  describe('getNextOccurrence', () => {
    it.each([
      [
        'DAILY with intervalN',
        '2026-04-01T00:00:00Z',
        { intervalType: 'DAILY' as const, intervalN: 3 },
        '2026-04-04',
      ],
      [
        'WEEKLY with target recurrenceDay',
        '2026-04-01T00:00:00Z',
        { intervalType: 'WEEKLY' as const, intervalN: 1, recurrenceDay: 5 },
        '2026-04-10',
      ],
      [
        'YEARLY recurrence',
        '2026-05-15T00:00:00Z',
        {
          intervalType: 'YEARLY' as const,
          intervalN: 1,
          recurrenceDay: 15,
          recurrenceMonth: 5,
        },
        '2027-05-15',
      ],
    ])('%s', (_label, startIso, rule, expectedDate) => {
      const start = new Date(startIso).getTime();
      const next = RecurrenceEngine.getNextOccurrence(start, rule);
      expect(dayjs(next).format('YYYY-MM-DD')).toBe(expectedDate);
    });

    it.each([
      ['2026-01-31T00:00:00Z', '2026-02-28'],
      ['2026-03-31T00:00:00Z', '2026-04-30'],
    ])('clips MONTHLY 31st anchor from %s to %s', (startIso, expectedDate) => {
      const next = RecurrenceEngine.getNextOccurrence(new Date(startIso).getTime(), {
        intervalType: 'MONTHLY',
        intervalN: 1,
        recurrenceDay: 31,
      });
      expect(dayjs(next).format('YYYY-MM-DD')).toBe(expectedDate);
    });
  });

  describe('getCurrentPeriod', () => {
    it('calculates monthly period starting on 1st', () => {
      const ref = new Date('2026-04-15T12:00:00Z').getTime();
      const period = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 1 },
        ref,
      );

      const start = dayjs(period.startDate).format('YYYY-MM-DD');
      const end = dayjs(period.endDate).format('YYYY-MM-DD');
      expect(start).toBe('2026-04-01');
      expect(end).toBe('2026-04-30');
    });

    it('calculates monthly period starting on 15th mid-month', () => {
      const ref = new Date('2026-04-20T12:00:00Z').getTime();
      const period = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 15 },
        ref,
      );

      const start = dayjs(period.startDate).format('YYYY-MM-DD');
      const end = dayjs(period.endDate).format('YYYY-MM-DD');
      expect(start).toBe('2026-04-15');
      expect(end).toBe('2026-05-14');
    });

    it('correctly handles intervalN = 3 (quarterly budget)', () => {
      const startAnchor = new Date('2026-01-01T00:00:00Z').getTime();
      const ref = new Date('2026-02-15T12:00:00Z').getTime();
      const period = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 3, recurrenceDay: 1, startDate: startAnchor },
        ref,
      );

      const start = dayjs(period.startDate).format('YYYY-MM-DD');
      const end = dayjs(period.endDate).format('YYYY-MM-DD');
      expect(start).toBe('2026-01-01');
      expect(end).toBe('2026-03-31');
    });

    it('correctly clips 31st monthly anchor across Jan, Feb, Mar, Apr', () => {
      // In January (31 days)
      const janRef = new Date('2026-01-31T12:00:00Z').getTime();
      const janPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 31 },
        janRef,
      );
      expect(dayjs(janPeriod.startDate).format('YYYY-MM-DD')).toBe('2026-01-31');
      expect(dayjs(janPeriod.endDate).format('YYYY-MM-DD')).toBe('2026-02-27');

      // In February (28 days non-leap)
      const febRef = new Date('2026-02-15T12:00:00Z').getTime();
      const febPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 31 },
        febRef,
      );
      expect(dayjs(febPeriod.startDate).format('YYYY-MM-DD')).toBe('2026-01-31');
      expect(dayjs(febPeriod.endDate).format('YYYY-MM-DD')).toBe('2026-02-27');

      // In March (31 days)
      const marRef = new Date('2026-03-15T12:00:00Z').getTime();
      const marPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 31 },
        marRef,
      );
      expect(dayjs(marPeriod.startDate).format('YYYY-MM-DD')).toBe('2026-02-28');
      expect(dayjs(marPeriod.endDate).format('YYYY-MM-DD')).toBe('2026-03-30');

      // In April (30 days)
      const aprRef = new Date('2026-04-15T12:00:00Z').getTime();
      const aprPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 31 },
        aprRef,
      );
      expect(dayjs(aprPeriod.startDate).format('YYYY-MM-DD')).toBe('2026-03-31');
      expect(dayjs(aprPeriod.endDate).format('YYYY-MM-DD')).toBe('2026-04-29');
    });

    it('correctly handles yearly recurrence anchored on Feb 29 (leap vs non-leap)', () => {
      // Leap year 2024
      const leapRef = new Date('2024-06-15T12:00:00Z').getTime();
      const leapPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'YEARLY', intervalN: 1, recurrenceMonth: 2, recurrenceDay: 29 },
        leapRef,
      );
      expect(dayjs(leapPeriod.startDate).format('YYYY-MM-DD')).toBe('2024-02-29');
      expect(dayjs(leapPeriod.endDate).format('YYYY-MM-DD')).toBe('2025-02-27');

      // Non-leap year 2025
      const nonLeapRef = new Date('2025-06-15T12:00:00Z').getTime();
      const nonLeapPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'YEARLY', intervalN: 1, recurrenceMonth: 2, recurrenceDay: 29 },
        nonLeapRef,
      );
      expect(dayjs(nonLeapPeriod.startDate).format('YYYY-MM-DD')).toBe('2025-02-28');
      expect(dayjs(nonLeapPeriod.endDate).format('YYYY-MM-DD')).toBe('2026-02-27');
    });
  });
});
