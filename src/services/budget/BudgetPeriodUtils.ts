import dayjs from 'dayjs';

export interface DateRange {
  startDate: number;
  endDate: number;
}

export interface BudgetPeriodInput {
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  createdAt?: Date | number;
}

export class BudgetPeriodUtils {
  /**
   * Calculates the start and end dates for the budget cycle containing the reference date.
   */
  static getCurrentPeriod(
    budget: BudgetPeriodInput,
    referenceDate: number = Date.now(),
  ): DateRange {
    const ref = dayjs(referenceDate);
    const intervalType = budget.intervalType || 'MONTHLY';
    const intervalN = budget.intervalN || 1;

    switch (intervalType) {
      case 'WEEKLY': {
        // Start from budget.startDate or a reasonable default, adjusted to the chosen day of week
        const baseAnchor = budget.startDate
          ? dayjs(budget.startDate)
          : dayjs(budget.createdAt).startOf('week');
        const startAnchor = baseAnchor.day(budget.recurrenceDay || 0);
        const daysInCycle = 7 * intervalN;

        const diffDays = ref.startOf('day').diff(startAnchor.startOf('day'), 'day');
        // Handle dates before startAnchor
        const cyclesPassed = Math.floor(diffDays / daysInCycle);
        const cycleStart = startAnchor.add(cyclesPassed * daysInCycle, 'day').startOf('day');
        const cycleEnd = cycleStart.add(daysInCycle - 1, 'day').endOf('day');

        return {
          startDate: cycleStart.valueOf(),
          endDate: cycleEnd.valueOf(),
        };
      }

      case 'MONTHLY': {
        const day = budget.recurrenceDay || 1;
        let cycleStart = ref.date(day).startOf('day');

        // If today is before the start day, the cycle started last month
        if (ref.date() < day) {
          cycleStart = cycleStart.subtract(1, 'month');
        }

        // The cycle ends the day before the same day next month
        const cycleEnd = cycleStart.add(1, 'month').subtract(1, 'day').endOf('day');

        return {
          startDate: cycleStart.valueOf(),
          endDate: cycleEnd.valueOf(),
        };
      }

      case 'YEARLY': {
        const month = (budget.recurrenceMonth || 1) - 1;
        const day = budget.recurrenceDay || 1;

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

      case 'DAILY': {
        const startAnchor = budget.startDate
          ? dayjs(budget.startDate)
          : dayjs(budget.createdAt).startOf('day');
        const diffDays = ref.startOf('day').diff(startAnchor.startOf('day'), 'day');
        const cyclesPassed = Math.floor(diffDays / intervalN);
        const cycleStart = startAnchor.add(cyclesPassed * intervalN, 'day').startOf('day');
        const cycleEnd = cycleStart.add(intervalN - 1, 'day').endOf('day');
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
   * Returns a human-readable string for the budget period.
   */
  static getPeriodLabel(budget: BudgetPeriodInput, referenceDate: number = Date.now()): string {
    const { startDate, endDate } = this.getCurrentPeriod(budget, referenceDate);
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const now = dayjs();

    const format = (d: dayjs.Dayjs) => {
      if (d.year() !== now.year()) return d.format('MMM D, YYYY');
      return d.format('MMM D');
    };

    return `${format(start)} - ${format(end)}`;
  }
}
