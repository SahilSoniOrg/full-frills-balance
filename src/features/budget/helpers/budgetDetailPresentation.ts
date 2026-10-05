import { BudgetUsage } from '@/src/services/budget/types';
import dayjs from 'dayjs';

export function presentBudgetPeriod(
  range: { startDate: number; endDate: number },
  usage: BudgetUsage,
  now: number,
) {
  const start = dayjs(range.startDate);
  const end = dayjs(range.endDate);
  const today = dayjs(now).startOf('day');
  const isCurrent = now >= range.startDate && now <= range.endDate;
  const periodDays = end.startOf('day').diff(start.startOf('day'), 'day') + 1;
  const daysRemaining = isCurrent ? end.startOf('day').diff(today, 'day') + 1 : 0;
  // Calendar day number matches the today marker (day 18 of 31 => 18/31).
  const elapsedDays = Math.min(
    periodDays,
    Math.max(0, today.diff(start.startOf('day'), 'day') + 1),
  );

  return {
    isCurrent,
    periodDays,
    daysRemaining,
    elapsedShare: elapsedDays / periodDays,
    dateRangeText: `${start.format('D MMM YYYY')} – ${end.format('D MMM YYYY')}`,
    dailyRemaining:
      isCurrent && !usage.hasUnvaluedEntries
        ? Math.max(usage.remaining, 0) / daysRemaining
        : undefined,
  };
}

export type BudgetPeriodPresentation = ReturnType<typeof presentBudgetPeriod>;
