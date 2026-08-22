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
