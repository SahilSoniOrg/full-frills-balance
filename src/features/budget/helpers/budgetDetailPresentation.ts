import { BudgetUsage } from '@/src/services/budget/types';
import dayjs from 'dayjs';

/** Calendar-day allowance, including today. Never infer capacity from incomplete FX. */
export function presentBudgetPeriod(
  range: { startDate: number; endDate: number },
  usage: BudgetUsage,
  now: number,
) {
  const start = dayjs(range.startDate);
  const end = dayjs(range.endDate);
  const today = dayjs(now).startOf('day');
  const isCurrent = now >= range.startDate && now <= range.endDate;
  const daysRemaining = isCurrent ? end.startOf('day').diff(today, 'day') + 1 : 0;

  return {
    dateRangeText: `${start.format('D MMM YYYY')} – ${end.format('D MMM YYYY')}`,
    timingText: isCurrent
      ? daysRemaining === 1
        ? 'Ends today'
        : `${daysRemaining} days remaining, including today`
      : now > range.endDate
        ? 'Period ended'
        : 'Period has not started',
    dailyRemaining:
      isCurrent && usage.remaining > 0 && !usage.hasUnvaluedEntries
        ? usage.remaining / daysRemaining
        : undefined,
  };
}
