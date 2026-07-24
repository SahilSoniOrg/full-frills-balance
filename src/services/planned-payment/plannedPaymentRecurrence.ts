import { PlannedPaymentInterval } from '@/src/data/models/PlannedPayment';

export type PlannedPaymentRecurrenceRule = {
  intervalN: number;
  intervalType: PlannedPaymentInterval;
  recurrenceDay?: number;
  recurrenceMonth?: number;
};

/** Normalizes a timestamp to local midnight. */
export function normalizeToStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Calculates the next occurrence after `current` based on interval and recurrence rules.
 */
export function calculateNextOccurrence(current: number, pp: PlannedPaymentRecurrenceRule): number {
  const date = new Date(normalizeToStartOfDay(current));

  const { intervalN, intervalType, recurrenceDay, recurrenceMonth } = pp;

  switch (intervalType) {
    case PlannedPaymentInterval.DAILY:
      date.setDate(date.getDate() + intervalN);
      break;
    case PlannedPaymentInterval.WEEKLY:
      date.setDate(date.getDate() + intervalN * 7);
      if (recurrenceDay !== undefined && recurrenceDay !== null) {
        const currentDay = date.getDay();
        const diff = (recurrenceDay - currentDay + 7) % 7;
        date.setDate(date.getDate() + diff);
      }
      break;
    case PlannedPaymentInterval.MONTHLY: {
      const targetDay = recurrenceDay ?? date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + intervalN);

      const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      break;
    }
    case PlannedPaymentInterval.YEARLY: {
      const targetMonth =
        recurrenceMonth !== undefined && recurrenceMonth !== null
          ? recurrenceMonth - 1
          : date.getMonth();
      const targetDay = recurrenceDay ?? date.getDate();

      date.setFullYear(date.getFullYear() + intervalN);
      date.setDate(1);
      date.setMonth(targetMonth);

      const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      break;
    }
  }
  return date.getTime();
}

/**
 * First occurrence for a new planned payment — aligns within the current period when possible.
 */
export function computeFirstOccurrence(
  startDate: number,
  pp: PlannedPaymentRecurrenceRule,
): number {
  const start = new Date(normalizeToStartOfDay(startDate));
  const { intervalType, recurrenceDay, recurrenceMonth } = pp;

  switch (intervalType) {
    case PlannedPaymentInterval.DAILY:
      return start.getTime();

    case PlannedPaymentInterval.WEEKLY: {
      if (recurrenceDay === undefined || recurrenceDay === null) {
        return start.getTime();
      }
      const startWeekday = start.getDay();
      const daysUntilTarget = (recurrenceDay - startWeekday + 7) % 7;
      start.setDate(start.getDate() + daysUntilTarget);
      return start.getTime();
    }

    case PlannedPaymentInterval.MONTHLY: {
      const targetDay = recurrenceDay ?? start.getDate();
      const candidate = new Date(start.getFullYear(), start.getMonth(), 1);
      const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
      candidate.setDate(Math.min(targetDay, lastDay));
      if (candidate.getTime() >= start.getTime()) {
        return candidate.getTime();
      }
      candidate.setDate(1);
      candidate.setMonth(candidate.getMonth() + 1);
      const lastDayNext = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
      candidate.setDate(Math.min(targetDay, lastDayNext));
      return candidate.getTime();
    }

    case PlannedPaymentInterval.YEARLY: {
      const targetMonth =
        recurrenceMonth !== undefined && recurrenceMonth !== null
          ? recurrenceMonth - 1
          : start.getMonth();
      const targetDay = recurrenceDay ?? start.getDate();
      const candidate = new Date(start.getFullYear(), targetMonth, 1);
      const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
      candidate.setDate(Math.min(targetDay, lastDay));
      if (candidate.getTime() >= start.getTime()) {
        return candidate.getTime();
      }
      candidate.setFullYear(candidate.getFullYear() + 1);
      candidate.setDate(1);
      candidate.setMonth(targetMonth);
      const lastDayNext = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
      candidate.setDate(Math.min(targetDay, lastDayNext));
      return candidate.getTime();
    }
  }
}
