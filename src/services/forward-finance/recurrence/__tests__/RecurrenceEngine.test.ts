import { RecurrenceEngine } from '../RecurrenceEngine';

describe('RecurrenceEngine', () => {
  describe('getNextOccurrence', () => {
    it('handles DAILY with intervalN', () => {
      const start = new Date('2026-04-01T00:00:00Z').getTime();
      const next = RecurrenceEngine.getNextOccurrence(start, {
        intervalType: 'DAILY',
        intervalN: 3,
      });
      expect(new Date(next).toISOString().split('T')[0]).toBe('2026-04-04');
    });

    it('handles WEEKLY with target recurrenceDay', () => {
      // 2026-04-01 is a Wednesday (day 3).
      // target recurrenceDay: 5 (Friday).
      const start = new Date('2026-04-01T00:00:00Z').getTime();
      const next = RecurrenceEngine.getNextOccurrence(start, {
        intervalType: 'WEEKLY',
        intervalN: 1,
        recurrenceDay: 5,
      });
      expect(new Date(next).toISOString().split('T')[0]).toBe('2026-04-10');
    });

    it('handles MONTHLY with 31st anchor clipped to 30-day month', () => {
      const jan31 = new Date('2026-01-31T00:00:00Z').getTime();
      const feb = RecurrenceEngine.getNextOccurrence(jan31, {
        intervalType: 'MONTHLY',
        intervalN: 1,
        recurrenceDay: 31,
      });
      expect(new Date(feb).toISOString().split('T')[0]).toBe('2026-02-28');

      const apr30 = new Date('2026-03-31T00:00:00Z').getTime();
      const apr = RecurrenceEngine.getNextOccurrence(apr30, {
        intervalType: 'MONTHLY',
        intervalN: 1,
        recurrenceDay: 31,
      });
      expect(new Date(apr).toISOString().split('T')[0]).toBe('2026-04-30');
    });

    it('handles YEARLY recurrence', () => {
      const start = new Date('2026-05-15T00:00:00Z').getTime();
      const next = RecurrenceEngine.getNextOccurrence(start, {
        intervalType: 'YEARLY',
        intervalN: 1,
        recurrenceDay: 15,
        recurrenceMonth: 5,
      });
      expect(new Date(next).toISOString().split('T')[0]).toBe('2027-05-15');
    });
  });

  describe('getCurrentPeriod', () => {
    it('calculates monthly period starting on 1st', () => {
      const ref = new Date('2026-04-15T12:00:00Z').getTime();
      const period = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 1 },
        ref,
      );

      const start = new Date(period.startDate).toISOString().split('T')[0];
      const end = new Date(period.endDate).toISOString().split('T')[0];
      expect(start).toBe('2026-04-01');
      expect(end).toBe('2026-04-30');
    });

    it('calculates monthly period starting on 15th mid-month', () => {
      const ref = new Date('2026-04-20T12:00:00Z').getTime();
      const period = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 15 },
        ref,
      );

      const start = new Date(period.startDate).toISOString().split('T')[0];
      const end = new Date(period.endDate).toISOString().split('T')[0];
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

      const start = new Date(period.startDate).toISOString().split('T')[0];
      const end = new Date(period.endDate).toISOString().split('T')[0];
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
      expect(new Date(janPeriod.startDate).toISOString().split('T')[0]).toBe('2026-01-31');
      expect(new Date(janPeriod.endDate).toISOString().split('T')[0]).toBe('2026-02-27');

      // In February (28 days non-leap)
      const febRef = new Date('2026-02-15T12:00:00Z').getTime();
      const febPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 31 },
        febRef,
      );
      expect(new Date(febPeriod.startDate).toISOString().split('T')[0]).toBe('2026-01-31');
      expect(new Date(febPeriod.endDate).toISOString().split('T')[0]).toBe('2026-02-27');

      // In March (31 days)
      const marRef = new Date('2026-03-15T12:00:00Z').getTime();
      const marPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 31 },
        marRef,
      );
      expect(new Date(marPeriod.startDate).toISOString().split('T')[0]).toBe('2026-02-28');
      expect(new Date(marPeriod.endDate).toISOString().split('T')[0]).toBe('2026-03-30');

      // In April (30 days)
      const aprRef = new Date('2026-04-15T12:00:00Z').getTime();
      const aprPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'MONTHLY', intervalN: 1, recurrenceDay: 31 },
        aprRef,
      );
      expect(new Date(aprPeriod.startDate).toISOString().split('T')[0]).toBe('2026-03-31');
      expect(new Date(aprPeriod.endDate).toISOString().split('T')[0]).toBe('2026-04-29');
    });

    it('correctly handles yearly recurrence anchored on Feb 29 (leap vs non-leap)', () => {
      // Leap year 2024
      const leapRef = new Date('2024-06-15T12:00:00Z').getTime();
      const leapPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'YEARLY', intervalN: 1, recurrenceMonth: 2, recurrenceDay: 29 },
        leapRef,
      );
      expect(new Date(leapPeriod.startDate).toISOString().split('T')[0]).toBe('2024-02-29');
      expect(new Date(leapPeriod.endDate).toISOString().split('T')[0]).toBe('2025-02-27');

      // Non-leap year 2025
      const nonLeapRef = new Date('2025-06-15T12:00:00Z').getTime();
      const nonLeapPeriod = RecurrenceEngine.getCurrentPeriod(
        { intervalType: 'YEARLY', intervalN: 1, recurrenceMonth: 2, recurrenceDay: 29 },
        nonLeapRef,
      );
      expect(new Date(nonLeapPeriod.startDate).toISOString().split('T')[0]).toBe('2025-02-28');
      expect(new Date(nonLeapPeriod.endDate).toISOString().split('T')[0]).toBe('2026-02-27');
    });
  });

  describe('getOccurrences', () => {
    it('returns all occurrences in a 90 day window', () => {
      const range = {
        startDate: new Date('2026-04-01T00:00:00Z').getTime(),
        endDate: new Date('2026-06-30T23:59:59Z').getTime(),
      };

      const occurrences = RecurrenceEngine.getOccurrences(
        {
          intervalType: 'MONTHLY',
          intervalN: 1,
          startDate: new Date('2026-04-05T00:00:00Z').getTime(),
          recurrenceDay: 5,
        },
        range,
      );

      expect(occurrences.length).toBe(3);
      const dates = occurrences.map(t => new Date(t).toISOString().split('T')[0]);
      expect(dates).toEqual(['2026-04-05', '2026-05-05', '2026-06-05']);
    });
  });
});
