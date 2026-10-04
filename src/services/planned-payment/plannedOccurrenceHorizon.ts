import { PlannedPaymentStatus } from '@/src/types/enums';
import type { PlainPlannedPayment } from '@/src/types/plainDtos';
import {
  calculateNextOccurrence,
  computeFirstOccurrence,
  normalizeToStartOfDay,
} from './plannedPaymentRecurrence';

export type PlannedHorizonOccurrence = {
  date: number;
  amount: number;
  currencyCode: string;
};

export type PlannedCursorHorizon =
  | { throughDate: number }
  | { maxNewOccurrences: number; attemptBudget: number };

/**
 * Projected schedule rows from the payment cursor. Saved journal days are excluded via
 * `savedDays`; callers merge saved rows separately when needed.
 */
export function projectPlannedOccurrencesForHorizon(
  payment: PlainPlannedPayment,
  savedDays: ReadonlySet<number>,
  horizon: PlannedCursorHorizon,
): PlannedHorizonOccurrence[] {
  if (payment.status !== PlannedPaymentStatus.ACTIVE) return [];

  if ('throughDate' in horizon) {
    const throughDate = horizon.throughDate;
    if (
      !Number.isFinite(normalizeToStartOfDay(throughDate)) ||
      !Number.isFinite(normalizeToStartOfDay(payment.startDate)) ||
      !Number.isFinite(normalizeToStartOfDay(payment.nextOccurrence)) ||
      (payment.endDate != null && !Number.isFinite(normalizeToStartOfDay(payment.endDate)))
    ) {
      return [];
    }
  }

  let cursor =
    payment.nextOccurrence < payment.startDate
      ? computeFirstOccurrence(payment.startDate, payment)
      : payment.nextOccurrence;
  const projected: PlannedHorizonOccurrence[] = [];
  let added = 0;
  const attemptLimit =
    'attemptBudget' in horizon ? horizon.attemptBudget : Number.POSITIVE_INFINITY;
  const throughDate = 'throughDate' in horizon ? horizon.throughDate : undefined;
  const maxNew =
    'maxNewOccurrences' in horizon ? horizon.maxNewOccurrences : Number.POSITIVE_INFINITY;

  for (let attempts = 0; attempts < attemptLimit; attempts++) {
    if (!Number.isFinite(cursor) || (payment.endDate != null && cursor > payment.endDate)) break;
    const day = normalizeToStartOfDay(cursor);
    if (cursor >= payment.startDate && !savedDays.has(day)) {
      projected.push({
        date: cursor,
        amount: payment.amount,
        currencyCode: payment.currencyCode,
      });
      if (throughDate === undefined) added++;
    }
    if (throughDate !== undefined && cursor > throughDate && cursor >= payment.startDate) break;
    if (throughDate === undefined && added >= maxNew) break;
    const next = calculateNextOccurrence(cursor, payment);
    if (!Number.isFinite(next) || next <= cursor) break;
    cursor = next;
  }

  return projected;
}
