import { BudgetUsage } from '@/src/services/budget/types';
import { describePeriodRange } from '@/src/utils/dateUtils';

export function presentBudgetPeriod(
  range: { startDate: number; endDate: number },
  usage: BudgetUsage,
  now: number,
) {
  // Calendar day number matches the today marker (day 18 of 31 => 18/31).
  const { elapsedDays, ...period } = describePeriodRange(range, now);

  return {
    ...period,
    elapsedShare: elapsedDays / period.periodDays,
    dailyRemaining:
      period.isCurrent && !usage.hasUnvaluedEntries
        ? Math.max(usage.remaining, 0) / period.daysRemaining
        : undefined,
  };
}

export type BudgetPeriodPresentation = ReturnType<typeof presentBudgetPeriod>;
