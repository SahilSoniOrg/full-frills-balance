import type { BudgetCumulativeSeries } from '@/src/services/projections/buildBudgetCumulativeSeries';
import dayjs from 'dayjs';

type PeriodRange = { startDate: number; endDate: number };

/** Read converted net spend through the equivalent calendar day, including that whole day. */
export function getBudgetPreviousComparisonSpent(
  chart: BudgetCumulativeSeries | null,
  currentPeriod: PeriodRange | undefined,
  previousPeriod: PeriodRange | undefined,
  now: number,
): number | null {
  if (!chart || !currentPeriod || !previousPeriod || now < currentPeriod.startDate) return null;

  const dayOffset = dayjs(now)
    .startOf('day')
    .diff(dayjs(currentPeriod.startDate).startOf('day'), 'day');
  const cutoff =
    now > currentPeriod.endDate
      ? previousPeriod.endDate
      : Math.min(
          dayjs(previousPeriod.startDate).add(dayOffset, 'day').endOf('day').valueOf(),
          previousPeriod.endDate,
        );

  // The step series can contain multiple points at one timestamp; the final one includes spend.
  for (let index = chart.data.length - 1; index >= 0; index--) {
    if (chart.data[index].x <= cutoff) return chart.data[index].y;
  }
  return 0;
}
