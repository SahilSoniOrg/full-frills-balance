import dayjs from 'dayjs';
import { DateRange, RecurrenceInterval, RecurrenceRule } from './types';

/** Normalizes a timestamp to local midnight. */
export function normalizeToStartOfDay(timestamp: number): number {
  return dayjs(timestamp).startOf('day').valueOf();
}

/** Clamps a date to the maximum valid day in its target month. */
function setClampedDate(date: dayjs.Dayjs, targetDay: number): dayjs.Dayjs {
  const maxDay = date.endOf('month').date();
  return date.date(Math.min(targetDay, maxDay));
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
        next = setClampedDate(next.date(1).add(intervalN, 'month'), targetDay);
        break;
      }

      case 'YEARLY': {
        const targetMonth =
          rule.recurrenceMonth !== undefined && rule.recurrenceMonth !== null
            ? rule.recurrenceMonth - 1
            : next.month();
        const targetDay = rule.recurrenceDay ?? next.date();

        next = setClampedDate(next.add(intervalN, 'year').month(targetMonth).date(1), targetDay);
        break;
      }

      default:
        next = next.add(intervalN, 'month');
        break;
    }

    return next.valueOf();
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
        const candidate = setClampedDate(start, targetDay);

        if (candidate.valueOf() >= start.valueOf()) {
          return candidate.valueOf();
        }

        const nextMonth = start.date(1).add(1, 'month');
        return setClampedDate(nextMonth, targetDay).valueOf();
      }

      case 'YEARLY': {
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
    const ref = dayjs(referenceDate).startOf('day');
    const intervalType = (rule.intervalType || 'MONTHLY') as RecurrenceInterval;
    const intervalN = Math.max(1, rule.intervalN || 1);

    switch (intervalType) {
      case 'DAILY': {
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
      }

      case 'WEEKLY': {
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
      }

      case 'MONTHLY': {
        const targetDay = rule.recurrenceDay ?? (rule.startDate ? dayjs(rule.startDate).date() : 1);
        const anchor = dayjs(rule.startDate || rule.createdAt || referenceDate).startOf('day');
        const monthsDiff = (ref.year() - anchor.year()) * 12 + (ref.month() - anchor.month());
        const cyclesPassed = Math.floor(monthsDiff / intervalN);

        let candidateMonth = anchor.date(1).add(cyclesPassed * intervalN, 'month');
        let startCandidate = setClampedDate(candidateMonth, targetDay).startOf('day');
        let nextStart = this.getNextOccurrence(startCandidate.valueOf(), rule);
        let endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');

        if (ref.isBefore(startCandidate)) {
          candidateMonth = candidateMonth.subtract(intervalN, 'month');
          startCandidate = setClampedDate(candidateMonth, targetDay).startOf('day');
          nextStart = this.getNextOccurrence(startCandidate.valueOf(), rule);
          endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
        } else if (ref.isAfter(endCandidate)) {
          candidateMonth = candidateMonth.add(intervalN, 'month');
          startCandidate = setClampedDate(candidateMonth, targetDay).startOf('day');
          nextStart = this.getNextOccurrence(startCandidate.valueOf(), rule);
          endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
        }

        return {
          startDate: startCandidate.valueOf(),
          endDate: endCandidate.valueOf(),
        };
      }

      case 'YEARLY': {
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
        let nextStart = this.getNextOccurrence(startCandidate.valueOf(), rule);
        let endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');

        if (ref.isBefore(startCandidate)) {
          candidateYear -= intervalN;
          startCandidate = setClampedDate(
            anchor.year(candidateYear).month(targetMonth).date(1),
            targetDay,
          ).startOf('day');
          nextStart = this.getNextOccurrence(startCandidate.valueOf(), rule);
          endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
        } else if (ref.isAfter(endCandidate)) {
          candidateYear += intervalN;
          startCandidate = setClampedDate(
            anchor.year(candidateYear).month(targetMonth).date(1),
            targetDay,
          ).startOf('day');
          nextStart = this.getNextOccurrence(startCandidate.valueOf(), rule);
          endCandidate = dayjs(nextStart).subtract(1, 'day').endOf('day');
        }

        return {
          startDate: startCandidate.valueOf(),
          endDate: endCandidate.valueOf(),
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
