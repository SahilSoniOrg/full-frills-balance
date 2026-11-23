import dayjs from 'dayjs';
import { type IntervalType, resolveIntervalPolicy } from '@/src/domain/recurrence/intervalPolicy';
import { DateRange, RecurrenceRule } from './types';

/** Normalizes a timestamp to local midnight. */
export function normalizeToStartOfDay(timestamp: number): number {
  return dayjs(timestamp).startOf('day').valueOf();
}

/** Clamps a date to the maximum valid day in its target month. */
function setClampedDate(date: dayjs.Dayjs, targetDay: number): dayjs.Dayjs {
  const maxDay = date.endOf('month').date();
  return date.date(Math.min(targetDay, maxDay));
}

type IntervalStrategy = {
  getNextOccurrence: (current: number, rule: RecurrenceRule, intervalN: number) => number;
  computeFirstOccurrence: (startDate: number, rule: RecurrenceRule) => number;
  getCurrentPeriod: (rule: RecurrenceRule, referenceDate: number, intervalN: number) => DateRange;
};

const INTERVAL_STRATEGIES: Record<IntervalType, IntervalStrategy> = {
  DAILY: {
    getNextOccurrence(current, _rule, intervalN) {
      return dayjs(current).add(intervalN, 'day').valueOf();
    },
    computeFirstOccurrence(startDate) {
      return dayjs(startDate).startOf('day').valueOf();
    },
    getCurrentPeriod(rule, referenceDate, intervalN) {
      const ref = dayjs(referenceDate).startOf('day');
      const startAnchor = rule.startDate
        ? dayjs(rule.startDate)
        : dayjs(rule.createdAt || referenceDate).startOf('day');
      const diffDays = ref.diff(startAnchor.startOf('day'), 'day');
      const cyclesPassed = Math.floor(diffDays / intervalN);
      const cycleStart = startAnchor.add(cyclesPassed * intervalN, 'day').startOf('day');
      const cycleEnd = cycleStart.add(intervalN - 1, 'day').endOf('day');
      return {
        startDate: cycleStart.valueOf(),
        endDate: cycleEnd.valueOf(),
      };
    },
  },

  WEEKLY: {
    getNextOccurrence(current, rule, intervalN) {
      let next = dayjs(current).add(intervalN, 'week');
      if (rule.recurrenceDay !== undefined && rule.recurrenceDay !== null) {
        const currentDay = next.day();
        const diff = (rule.recurrenceDay - currentDay + 7) % 7;
        next = next.add(diff, 'day');
      }
      return next.valueOf();
    },
    computeFirstOccurrence(startDate, rule) {
      const start = dayjs(startDate).startOf('day');
      const { recurrenceDay } = rule;
      if (recurrenceDay === undefined || recurrenceDay === null) {
        return start.valueOf();
      }
      const startWeekday = start.day();
      const daysUntilTarget = (recurrenceDay - startWeekday + 7) % 7;
      return start.add(daysUntilTarget, 'day').valueOf();
    },
    getCurrentPeriod(rule, referenceDate, intervalN) {
      const ref = dayjs(referenceDate).startOf('day');
      const baseAnchor = rule.startDate
        ? dayjs(rule.startDate)
        : dayjs(rule.createdAt || referenceDate).startOf('week');
      const startAnchor = baseAnchor.day(rule.recurrenceDay || 0);
      const daysInCycle = 7 * intervalN;

      const diffDays = ref.diff(startAnchor.startOf('day'), 'day');
      const cyclesPassed = Math.floor(diffDays / daysInCycle);
      const cycleStart = startAnchor.add(cyclesPassed * daysInCycle, 'day').startOf('day');
      const cycleEnd = cycleStart.add(daysInCycle - 1, 'day').endOf('day');

      return {
        startDate: cycleStart.valueOf(),
        endDate: cycleEnd.valueOf(),
      };
    },
  },

  MONTHLY: {
    getNextOccurrence(current, rule, intervalN) {
      const next = dayjs(current);
      const targetDay = rule.recurrenceDay ?? next.date();
      return setClampedDate(next.date(1).add(intervalN, 'month'), targetDay).valueOf();
    },
    computeFirstOccurrence(startDate, rule) {
      const start = dayjs(startDate).startOf('day');
      const targetDay = rule.recurrenceDay ?? start.date();
      const candidate = setClampedDate(start, targetDay);

      if (candidate.valueOf() >= start.valueOf()) {
        return candidate.valueOf();
      }

      const nextMonth = start.date(1).add(1, 'month');
      return setClampedDate(nextMonth, targetDay).valueOf();
    },
    getCurrentPeriod(rule, referenceDate, intervalN) {
      const ref = dayjs(referenceDate).startOf('day');
      const targetDay = rule.recurrenceDay ?? (rule.startDate ? dayjs(rule.startDate).date() : 1);
      const anchor = dayjs(rule.startDate || rule.createdAt || referenceDate).startOf('day');
      const monthsDiff = (ref.year() - anchor.year()) * 12 + (ref.month() - anchor.month());
      const cyclesPassed = Math.floor(monthsDiff / intervalN);

      let candidateMonth = anchor.date(1).add(cyclesPassed * intervalN, 'month');
      let startCandidate = setClampedDate(candidateMonth, targetDay).startOf('day');
      let nextStart = getNextOccurrence(startCandidate.valueOf(), rule);
      let endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');

      if (ref.isBefore(startCandidate)) {
        candidateMonth = candidateMonth.subtract(intervalN, 'month');
        startCandidate = setClampedDate(candidateMonth, targetDay).startOf('day');
        nextStart = getNextOccurrence(startCandidate.valueOf(), rule);
        endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
      } else if (ref.isAfter(endCandidate)) {
        candidateMonth = candidateMonth.add(intervalN, 'month');
        startCandidate = setClampedDate(candidateMonth, targetDay).startOf('day');
        nextStart = getNextOccurrence(startCandidate.valueOf(), rule);
        endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
      }

      return {
        startDate: startCandidate.valueOf(),
        endDate: endCandidate.valueOf(),
      };
    },
  },

  YEARLY: {
    getNextOccurrence(current, rule, intervalN) {
      const next = dayjs(current);
      const targetMonth =
        rule.recurrenceMonth !== undefined && rule.recurrenceMonth !== null
          ? rule.recurrenceMonth - 1
          : next.month();
      const targetDay = rule.recurrenceDay ?? next.date();

      return setClampedDate(
        next.add(intervalN, 'year').month(targetMonth).date(1),
        targetDay,
      ).valueOf();
    },
    computeFirstOccurrence(startDate, rule) {
      const start = dayjs(startDate).startOf('day');
      const { recurrenceDay, recurrenceMonth } = rule;
      const targetMonth =
        recurrenceMonth !== undefined && recurrenceMonth !== null
          ? recurrenceMonth - 1
          : start.month();
      const targetDay = recurrenceDay ?? start.date();

      let candidate = setClampedDate(start.month(targetMonth).date(1), targetDay);

      if (candidate.valueOf() >= start.valueOf()) {
        return candidate.valueOf();
      }

      const nextYear = start.add(1, 'year').month(targetMonth).date(1);
      return setClampedDate(nextYear, targetDay).valueOf();
    },
    getCurrentPeriod(rule, referenceDate, intervalN) {
      const ref = dayjs(referenceDate).startOf('day');
      const targetMonth =
        rule.recurrenceMonth !== undefined && rule.recurrenceMonth !== null
          ? rule.recurrenceMonth - 1
          : rule.startDate
            ? dayjs(rule.startDate).month()
            : 0;
      const targetDay = rule.recurrenceDay ?? (rule.startDate ? dayjs(rule.startDate).date() : 1);
      const anchor = dayjs(rule.startDate || rule.createdAt || referenceDate).startOf('day');
      const yearsDiff = ref.year() - anchor.year();
      const cyclesPassed = Math.floor(yearsDiff / intervalN);

      let candidateYear = anchor.year() + cyclesPassed * intervalN;
      let startCandidate = setClampedDate(
        anchor.year(candidateYear).month(targetMonth).date(1),
        targetDay,
      ).startOf('day');
      let nextStart = getNextOccurrence(startCandidate.valueOf(), rule);
      let endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');

      if (ref.isBefore(startCandidate)) {
        candidateYear -= intervalN;
        startCandidate = setClampedDate(
          anchor.year(candidateYear).month(targetMonth).date(1),
          targetDay,
        ).startOf('day');
        nextStart = getNextOccurrence(startCandidate.valueOf(), rule);
        endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
      } else if (ref.isAfter(endCandidate)) {
        candidateYear += intervalN;
        startCandidate = setClampedDate(
          anchor.year(candidateYear).month(targetMonth).date(1),
          targetDay,
        ).startOf('day');
        nextStart = getNextOccurrence(startCandidate.valueOf(), rule);
        endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
      }

      return {
        startDate: startCandidate.valueOf(),
        endDate: endCandidate.valueOf(),
      };
    },
  },
};

function strategyFor(rule: RecurrenceRule): IntervalStrategy {
  return INTERVAL_STRATEGIES[resolveIntervalPolicy(rule.intervalType).type];
}

/**
 * Calculates the next discrete occurrence strictly after `current` based on rule.
 */
export function getNextOccurrence(current: number, rule: RecurrenceRule): number {
  const intervalN = Math.max(1, rule.intervalN || 1);
  return strategyFor(rule).getNextOccurrence(current, rule, intervalN);
}

/**
 * First occurrence for a new recurrence rule — aligns within the start period when possible.
 */
export function computeFirstOccurrence(startDate: number, rule: RecurrenceRule): number {
  return strategyFor(rule).computeFirstOccurrence(startDate, rule);
}

/** Finds the first occurrence on or after a date while preserving the original cycle anchor. */
export function getOccurrenceOnOrAfter(
  startDate: number,
  rule: RecurrenceRule,
  referenceDate: number,
): number {
  const first = computeFirstOccurrence(startDate, rule);
  const reference = dayjs(referenceDate).startOf('day');
  if (first >= reference.valueOf()) return first;

  const policy = resolveIntervalPolicy(rule.intervalType);
  const unit = policy.unit;
  const count = Math.max(1, rule.intervalN || 1);
  const cycles = Math.floor(reference.diff(dayjs(first), unit) / count);
  const anchoredRule = {
    ...rule,
    recurrenceDay:
      rule.recurrenceDay ?? (unit === 'week' ? dayjs(first).day() : dayjs(first).date()),
    recurrenceMonth: rule.recurrenceMonth ?? dayjs(first).month() + 1,
  };
  let occurrence =
    cycles > 0 ? getNextOccurrence(first, { ...anchoredRule, intervalN: cycles * count }) : first;
  while (occurrence < reference.valueOf()) {
    occurrence = getNextOccurrence(occurrence, anchoredRule);
  }
  return occurrence;
}

/**
 * Calculates the active cycle start and end dates containing referenceDate.
 */
export function getCurrentPeriod(
  rule: RecurrenceRule,
  referenceDate: number = Date.now(),
): DateRange {
  const intervalN = Math.max(1, rule.intervalN || 1);
  return strategyFor(rule).getCurrentPeriod(rule, referenceDate, intervalN);
}

/**
 * Returns a formatted period label for a given cycle.
 */
export function getPeriodLabel(rule: RecurrenceRule, referenceDate: number = Date.now()): string {
  const { startDate, endDate } = getCurrentPeriod(rule, referenceDate);
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const now = dayjs();

  const format = (d: dayjs.Dayjs) => {
    if (d.year() !== now.year()) return d.format('MMM D, YYYY');
    return d.format('MMM D');
  };

  if (resolveIntervalPolicy(rule.intervalType).type === 'DAILY' && start.isSame(end, 'day')) {
    return format(start);
  }

  return `${format(start)} - ${format(end)}`;
}

export const RecurrenceEngine = {
  getNextOccurrence,
  computeFirstOccurrence,
  getOccurrenceOnOrAfter,
  getCurrentPeriod,
  getPeriodLabel,
};
