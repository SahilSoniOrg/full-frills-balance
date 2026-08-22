import dayjs from 'dayjs';
import { DateRange, RecurrenceInterval, RecurrenceRule } from './types';

/** Normalizes a timestamp to local midnight. */
export function normalizeToStartOfDay(timestamp: number): number {
  return dayjs(timestamp).startOf('day').valueOf();
}

export class RecurrenceEngine {
  /**
   * Calculates the next discrete occurrence strictly after `current` based on rule.
   */
  static getNextOccurrence(current: number, rule: RecurrenceRule): number {
    const intervalN = Math.max(1, rule.intervalN || 1);
    const intervalType = (rule.intervalType || 'MONTHLY') as RecurrenceInterval;
    let next = dayjs(current);

    switch (intervalType) {
      case 'DAILY':
        next = next.add(intervalN, 'day');
        break;

      case 'WEEKLY':
        next = next.add(intervalN, 'week');
        if (rule.recurrenceDay !== undefined && rule.recurrenceDay !== null) {
          const currentDay = next.day();
          const diff = (rule.recurrenceDay - currentDay + 7) % 7;
          next = next.add(diff, 'day');
        }
        break;

      case 'MONTHLY': {
        const targetDay = rule.recurrenceDay ?? next.date();
        next = next.date(1).add(intervalN, 'month');
        const lastDayOfMonth = next.endOf('month').date();
        next = next.date(Math.min(targetDay, lastDayOfMonth));
        break;
      }

      case 'YEARLY': {
        const targetMonth =
          rule.recurrenceMonth !== undefined && rule.recurrenceMonth !== null
            ? rule.recurrenceMonth - 1
            : next.month();
        const targetDay = rule.recurrenceDay ?? next.date();

        next = next.add(intervalN, 'year').month(targetMonth).date(1);
        const lastDayOfMonth = next.endOf('month').date();
        next = next.date(Math.min(targetDay, lastDayOfMonth));
        break;
      }

      default:
        next = next.add(intervalN, 'month');
        break;
    }

    return next.startOf('day').valueOf();
  }

  /**
   * First occurrence for a new recurrence rule — aligns within the start period when possible.
   */
  static computeFirstOccurrence(startDate: number, rule: RecurrenceRule): number {
    const start = dayjs(startDate).startOf('day');
    const intervalType = (rule.intervalType || 'MONTHLY') as RecurrenceInterval;
    const { recurrenceDay, recurrenceMonth } = rule;

    switch (intervalType) {
      case 'DAILY':
        return start.valueOf();

      case 'WEEKLY': {
        if (recurrenceDay === undefined || recurrenceDay === null) {
          return start.valueOf();
        }
        const startWeekday = start.day();
        const daysUntilTarget = (recurrenceDay - startWeekday + 7) % 7;
        return start.add(daysUntilTarget, 'day').valueOf();
      }

      case 'MONTHLY': {
        const targetDay = recurrenceDay ?? start.date();
        const lastDayThisMonth = start.endOf('month').date();
        const candidateDay = Math.min(targetDay, lastDayThisMonth);
        const candidate = start.date(candidateDay);

        if (candidate.valueOf() >= start.valueOf()) {
          return candidate.valueOf();
        }

        const nextMonth = start.date(1).add(1, 'month');
        const lastDayNextMonth = nextMonth.endOf('month').date();
        return nextMonth.date(Math.min(targetDay, lastDayNextMonth)).valueOf();
      }

      case 'YEARLY': {
        const targetMonth =
          recurrenceMonth !== undefined && recurrenceMonth !== null
            ? recurrenceMonth - 1
            : start.month();
        const targetDay = recurrenceDay ?? start.date();

        let candidate = start.month(targetMonth).date(1);
        const lastDayThisYear = candidate.endOf('month').date();
        candidate = candidate.date(Math.min(targetDay, lastDayThisYear));

        if (candidate.valueOf() >= start.valueOf()) {
          return candidate.valueOf();
        }

        let nextYear = start.add(1, 'year').month(targetMonth).date(1);
        const lastDayNextYear = nextYear.endOf('month').date();
        return nextYear.date(Math.min(targetDay, lastDayNextYear)).valueOf();
      }

      default:
        return start.valueOf();
    }
  }

  /**
   * Generates all discrete occurrence timestamps within the given date range.
   */
  static getOccurrences(rule: RecurrenceRule, range: DateRange): number[] {
    const occurrences: number[] = [];
    const firstOccur = rule.startDate
      ? this.computeFirstOccurrence(rule.startDate, rule)
      : range.startDate;

    let curr = firstOccur;
    const maxEnd = Math.min(range.endDate, rule.endDate || Infinity);

    // If start is before range, advance until within range
    while (curr < range.startDate && curr <= maxEnd) {
      const next = this.getNextOccurrence(curr, rule);
      if (next <= curr) break; // guard against infinite loops
      curr = next;
    }

    while (curr <= maxEnd) {
      if (curr >= range.startDate) {
        occurrences.push(curr);
      }
      const next = this.getNextOccurrence(curr, rule);
      if (next <= curr) break;
      curr = next;
    }

    return occurrences;
  }

  /**
   * Calculates the active cycle start and end dates containing referenceDate.
   */
  static getCurrentPeriod(rule: RecurrenceRule, referenceDate: number = Date.now()): DateRange {
    const ref = dayjs(referenceDate);
    const intervalType = (rule.intervalType || 'MONTHLY') as RecurrenceInterval;
    const intervalN = Math.max(1, rule.intervalN || 1);

    switch (intervalType) {
      case 'DAILY': {
        const startAnchor = rule.startDate
          ? dayjs(rule.startDate)
          : dayjs(rule.createdAt || referenceDate).startOf('day');
        const diffDays = ref.startOf('day').diff(startAnchor.startOf('day'), 'day');
        const cyclesPassed = Math.floor(diffDays / intervalN);
        const cycleStart = startAnchor.add(cyclesPassed * intervalN, 'day').startOf('day');
        const cycleEnd = cycleStart.add(intervalN - 1, 'day').endOf('day');
        return {
          startDate: cycleStart.valueOf(),
          endDate: cycleEnd.valueOf(),
        };
      }

      case 'WEEKLY': {
        const baseAnchor = rule.startDate
          ? dayjs(rule.startDate)
          : dayjs(rule.createdAt || referenceDate).startOf('week');
        const startAnchor = baseAnchor.day(rule.recurrenceDay || 0);
        const daysInCycle = 7 * intervalN;

        const diffDays = ref.startOf('day').diff(startAnchor.startOf('day'), 'day');
        const cyclesPassed = Math.floor(diffDays / daysInCycle);
        const cycleStart = startAnchor.add(cyclesPassed * daysInCycle, 'day').startOf('day');
        const cycleEnd = cycleStart.add(daysInCycle - 1, 'day').endOf('day');

        return {
          startDate: cycleStart.valueOf(),
          endDate: cycleEnd.valueOf(),
        };
      }

      case 'MONTHLY': {
        const day = rule.recurrenceDay || 1;
        let cycleStart = ref.date(day).startOf('day');

        if (ref.date() < day) {
          cycleStart = cycleStart.subtract(1, 'month');
        }

        const cycleEnd = cycleStart.add(1, 'month').subtract(1, 'day').endOf('day');

        return {
          startDate: cycleStart.valueOf(),
          endDate: cycleEnd.valueOf(),
        };
      }

      case 'YEARLY': {
        const month = (rule.recurrenceMonth || 1) - 1;
        const day = rule.recurrenceDay || 1;

        let cycleStart = ref.month(month).date(day).startOf('day');

        if (ref.isBefore(cycleStart)) {
          cycleStart = cycleStart.subtract(1, 'year');
        }

        const cycleEnd = cycleStart.add(1, 'year').subtract(1, 'day').endOf('day');

        return {
          startDate: cycleStart.valueOf(),
          endDate: cycleEnd.valueOf(),
        };
      }

      default: {
        return {
          startDate: ref.startOf('month').valueOf(),
          endDate: ref.endOf('month').valueOf(),
        };
      }
    }
  }

  /**
   * Returns a formatted period label for a given cycle.
   */
  static getPeriodLabel(rule: RecurrenceRule, referenceDate: number = Date.now()): string {
    const { startDate, endDate } = this.getCurrentPeriod(rule, referenceDate);
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const now = dayjs();

    const format = (d: dayjs.Dayjs) => {
      if (d.year() !== now.year()) return d.format('MMM D, YYYY');
      return d.format('MMM D');
    };

    if ((rule.intervalType || 'MONTHLY') === 'DAILY' && start.isSame(end, 'day')) {
      return format(start);
    }

    return `${format(start)} - ${format(end)}`;
  }
}
