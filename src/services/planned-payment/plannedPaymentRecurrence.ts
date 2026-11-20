import {
  RecurrenceEngine,
  normalizeToStartOfDay,
} from '@/src/services/forward-finance/recurrence/RecurrenceEngine';
import { PlannedPaymentInterval } from '@/src/types/enums';

export { normalizeToStartOfDay };

/** Last millisecond of the occurrence's local calendar day (DST-safe). */
export function endOfLocalDay(timestamp: number): number {
  const nextDay = new Date(normalizeToStartOfDay(timestamp));
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay.getTime() - 1;
}

export type PlannedPaymentRecurrenceRule = {
  intervalN: number;
  intervalType: PlannedPaymentInterval;
  recurrenceDay?: number;
  recurrenceMonth?: number;
};

/**
 * Calculates the next occurrence after `current` based on interval and recurrence rules.
 */
export function calculateNextOccurrence(current: number, pp: PlannedPaymentRecurrenceRule): number {
  return RecurrenceEngine.getNextOccurrence(current, pp);
}

/**
 * First occurrence for a new planned payment — aligns within the current period when possible.
 */
export function computeFirstOccurrence(
  startDate: number,
  pp: PlannedPaymentRecurrenceRule,
): number {
  return RecurrenceEngine.computeFirstOccurrence(startDate, pp);
}
