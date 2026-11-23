/**
 * Shared DAILY/WEEKLY/MONTHLY/YEARLY policy — one place for interval metadata
 * used by recurrence math, match windows, and schedule UI.
 */

export type IntervalType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type DayjsIntervalUnit = 'day' | 'week' | 'month' | 'year';

/** How `recurrenceDay` is interpreted for this interval. */
export type RecurrenceDayKind = 'none' | 'weekday' | 'monthDay';

export type IntervalPolicy = {
  type: IntervalType;
  /** dayjs add/diff unit for one interval step. */
  unit: DayjsIntervalUnit;
  /** Approximate calendar days per one interval step (match windows). */
  approxDays: number;
  recurrenceDayKind: RecurrenceDayKind;
  usesRecurrenceMonth: boolean;
};

export const INTERVAL_TYPES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
] as const satisfies readonly IntervalType[];

export const DEFAULT_INTERVAL_TYPE: IntervalType = 'MONTHLY';

export const INTERVAL_POLICIES: Record<IntervalType, IntervalPolicy> = {
  DAILY: {
    type: 'DAILY',
    unit: 'day',
    approxDays: 1,
    recurrenceDayKind: 'none',
    usesRecurrenceMonth: false,
  },
  WEEKLY: {
    type: 'WEEKLY',
    unit: 'week',
    approxDays: 7,
    recurrenceDayKind: 'weekday',
    usesRecurrenceMonth: false,
  },
  MONTHLY: {
    type: 'MONTHLY',
    unit: 'month',
    approxDays: 30,
    recurrenceDayKind: 'monthDay',
    usesRecurrenceMonth: false,
  },
  YEARLY: {
    type: 'YEARLY',
    unit: 'year',
    approxDays: 365,
    recurrenceDayKind: 'monthDay',
    usesRecurrenceMonth: true,
  },
};

export function isIntervalType(value: string | null | undefined): value is IntervalType {
  return typeof value === 'string' && (INTERVAL_TYPES as readonly string[]).includes(value);
}

/** Unknown / empty types fall back to MONTHLY (historical engine default). */
export function resolveIntervalPolicy(intervalType: string | null | undefined): IntervalPolicy {
  if (isIntervalType(intervalType)) return INTERVAL_POLICIES[intervalType];
  return INTERVAL_POLICIES[DEFAULT_INTERVAL_TYPE];
}

/** Match-window span in approximate days for `intervalN` steps of this type. */
export function approxIntervalDays(
  intervalType: string | null | undefined,
  intervalN: number | null | undefined,
): number {
  const n = Math.max(1, intervalN || 1);
  return n * resolveIntervalPolicy(intervalType).approxDays;
}

export type ScheduleAnchors = {
  weekday: number;
  dayOfMonth: number;
  /** 1–12 */
  month: number;
};

/** Default recurrenceDay / recurrenceMonth when switching interval type in the schedule UI. */
export function scheduleFieldsForInterval(
  intervalType: IntervalType,
  anchors: ScheduleAnchors,
): { recurrenceDay: number | undefined; recurrenceMonth: number | undefined } {
  const policy = INTERVAL_POLICIES[intervalType];
  if (policy.recurrenceDayKind === 'none') {
    return { recurrenceDay: undefined, recurrenceMonth: undefined };
  }
  if (policy.recurrenceDayKind === 'weekday') {
    return { recurrenceDay: anchors.weekday, recurrenceMonth: undefined };
  }
  return {
    recurrenceDay: anchors.dayOfMonth,
    recurrenceMonth: policy.usesRecurrenceMonth ? anchors.month : undefined,
  };
}
