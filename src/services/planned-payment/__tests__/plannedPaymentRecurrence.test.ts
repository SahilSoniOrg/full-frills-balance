import { PlannedPaymentInterval } from '@/src/types/enums';
import { calculateNextOccurrence, computeFirstOccurrence } from '../plannedPaymentRecurrence';

describe('planned payment recurrence', () => {
  describe('calculateNextOccurrence', () => {
    const JAN_31_2024 = new Date(2024, 0, 31, 0, 0, 0).getTime();

    test('Daily: adds N days and normalizes to midnight', () => {
      const next = calculateNextOccurrence(JAN_31_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.DAILY,
      });
      const d = new Date(next);
      expect(d.getFullYear()).toBe(2024);
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
    });

    test('Weekly: aligns to specific recurrenceWeekday (Monday)', () => {
      const monday = new Date(2024, 0, 22).getTime();
      const next = calculateNextOccurrence(monday, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 1,
      });
      const d = new Date(next);
      expect(d.getDay()).toBe(1);
      expect(d.getDate()).toBe(29);
    });

    test('Monthly: handles month-end overflow (31st to 29th in Leap Year)', () => {
      const next = calculateNextOccurrence(JAN_31_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 31,
      });
      const d = new Date(next);
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(29);
    });

    test('Monthly: recovers to original recurrenceDay after shorter month', () => {
      const FEB_29_2024 = new Date(2024, 1, 29).getTime();
      const next = calculateNextOccurrence(FEB_29_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 31,
      });
      const d = new Date(next);
      expect(d.getMonth()).toBe(2);
      expect(d.getDate()).toBe(31);
    });

    test('Yearly: aligns to specific recurrenceMonth and recurrenceDay', () => {
      const next = calculateNextOccurrence(JAN_31_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 12,
        recurrenceDay: 25,
      });
      const d = new Date(next);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(11);
      expect(d.getDate()).toBe(25);
    });

    test('Weekly: just adds weeks if no specific weekday is set', () => {
      const next = calculateNextOccurrence(JAN_31_2024, {
        intervalN: 2,
        intervalType: PlannedPaymentInterval.WEEKLY,
      });
      const d = new Date(next);
      expect(d.getDate()).toBe(14);
      expect(d.getMonth()).toBe(1);
    });

    test('Weekly: ensures N-week interval is respected even if target day is earlier in the week', () => {
      const monday = new Date(2024, 0, 22).getTime();
      const next = calculateNextOccurrence(monday, {
        intervalN: 2,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 0,
      });
      const d = new Date(next);
      expect(d.getDate()).toBe(11);
      expect(d.getMonth()).toBe(1);
      expect(d.getDay()).toBe(0);
    });
  });

  describe('computeFirstOccurrence', () => {
    const MAR_6_2026 = new Date(2026, 2, 6, 10, 30, 0).getTime();

    test('Daily: returns midnight of startDate', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.DAILY,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(2);
      expect(d.getDate()).toBe(6);
      expect(d.getHours()).toBe(0);
    });

    test('Monthly: recurrenceDay in the future this month → same month', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 20,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(2);
      expect(d.getDate()).toBe(20);
    });

    test('Monthly: recurrenceDay equals startDate day → same day', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 6,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(2);
      expect(d.getDate()).toBe(6);
    });

    test('Monthly: recurrenceDay already passed this month → next month', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 5,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(3);
      expect(d.getDate()).toBe(5);
    });

    test('Monthly: handles month-end overflow (recurrenceDay=31 in April → Apr 30)', () => {
      const APR_1_2026 = new Date(2026, 3, 1).getTime();
      const result = computeFirstOccurrence(APR_1_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 31,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(3);
      expect(d.getDate()).toBe(30);
    });

    test('Weekly: recurrenceDay ahead in week → returns correct upcoming day', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 0,
      });
      const d = new Date(result);
      expect(d.getDay()).toBe(0);
      expect(d.getDate()).toBe(8);
    });

    test('Weekly: recurrenceDay equals startDate weekday → same day', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 5,
      });
      const d = new Date(result);
      expect(d.getDay()).toBe(5);
      expect(d.getDate()).toBe(6);
    });

    test('Yearly: target month/day in future this year → same year', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 12,
        recurrenceDay: 25,
      });
      const d = new Date(result);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(11);
      expect(d.getDate()).toBe(25);
    });

    test('Yearly: target month/day already passed this year → next year', () => {
      const result = computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 1,
        recurrenceDay: 15,
      });
      const d = new Date(result);
      expect(d.getFullYear()).toBe(2027);
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(15);
    });
  });
});
