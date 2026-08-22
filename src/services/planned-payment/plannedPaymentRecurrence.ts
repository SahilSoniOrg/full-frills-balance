import {
  RecurrenceEngine,
  normalizeToStartOfDay,
} from '@/src/services/forward-finance/recurrence/RecurrenceEngine';
import { PlannedPaymentInterval } from '@/src/types/domain';

export { normalizeToStartOfDay };

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
