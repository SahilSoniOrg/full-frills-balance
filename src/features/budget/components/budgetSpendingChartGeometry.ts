import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import type { BudgetCumulativeSeries } from '@/src/services/projections/buildBudgetCumulativeSeries';
import type { DateRange } from '@/src/services/budget/BudgetPeriodUtils';
import dayjs from 'dayjs';
type Point = { x: number; y: number };

/** End-of-day cumulative values, retaining refunds and days without postings. */
export function buildBudgetSpendingDailyPoints(
  chart: BudgetCumulativeChart | null,
  period: DateRange | undefined,
  cutoff?: number,
): { date: number; offset: number; spent: number }[] {
  if (!chart || !period) return [];
  const lastDate = Math.min(period.endDate, cutoff ?? period.endDate);
  const points = [];
  let cursor = 0;
  let spent = 0;
  for (
    let day = dayjs(period.startDate).startOf('day');
    day.valueOf() <= lastDate;
    day = day.add(1, 'day')
  ) {
    const dayEnd = Math.min(day.endOf('day').valueOf(), lastDate);
    while (cursor < chart.data.length && chart.data[cursor].x <= dayEnd) {
      spent = chart.data[cursor].y;
      cursor += 1;
    }
    points.push({
      date: day.valueOf(),
      offset: getFractionalCalendarOffset(dayEnd, period.startDate),
      spent,
    });
  }
  return points;
}

export interface BudgetSpendingChartGeometry {
  currentPoints: Point[];
  previousPoints: Point[];
  todayOffset: number;
  todaySpent: number;
}

/** Calendar-aligned offsets retain each posting's position within its journal day. */
export function getFractionalCalendarOffset(timestamp: number, periodStart: number): number {
  const start = dayjs(periodStart).startOf('day');
  const date = dayjs(timestamp);
  const dateStart = date.startOf('day');
  const dayIndex = dateStart.diff(start, 'day');
  if (timestamp === date.endOf('day').valueOf()) return dayIndex + 1;
  const nextDay = dateStart.add(1, 'day');
  const dayDuration = nextDay.valueOf() - dateStart.valueOf();
  const withinDay = (timestamp - dateStart.valueOf()) / dayDuration;
  return dayIndex + Math.min(1, Math.max(0, withinDay));
}

export function buildBudgetSpendingChartGeometry({
  chartData,
  previousChartData,
  currentPeriod,
  previousPeriod,
  periodDays,
  elapsedShare,
  isCurrentPeriod,
  now,
}: {
  chartData: BudgetCumulativeChart;
  previousChartData: BudgetCumulativeChart | null;
  currentPeriod: DateRange;
  previousPeriod?: DateRange;
  periodDays: number;
  elapsedShare: number;
  isCurrentPeriod: boolean;
  now: number;
}): BudgetSpendingChartGeometry {
  const todayOffset = Math.min(periodDays, Math.max(0, elapsedShare * periodDays));
  const currentCutoff = isCurrentPeriod ? dayjs(now).endOf('day').valueOf() : currentPeriod.endDate;
  const currentPoints = chartData.data
    .filter(point => point.x <= currentCutoff)
    .map(point => ({
      x: getFractionalCalendarOffset(point.x, currentPeriod.startDate),
      y: point.y,
    }));
  const lastCurrentPoint = currentPoints.at(-1);
  if (isCurrentPeriod && lastCurrentPoint && lastCurrentPoint.x < todayOffset) {
    currentPoints.push({ x: todayOffset, y: lastCurrentPoint.y });
  }
  const previousPoints =
    previousChartData && previousPeriod
      ? previousChartData.data
          .filter(
            point => getFractionalCalendarOffset(point.x, previousPeriod.startDate) <= periodDays,
          )
          .map(point => ({
            x: getFractionalCalendarOffset(point.x, previousPeriod.startDate),
            y: point.y,
          }))
      : [];

  return {
    currentPoints,
    previousPoints,
    todayOffset,
    todaySpent: currentPoints.at(-1)?.y ?? 0,
  };
}

/** Read converted net spend through the equivalent calendar day, including that whole day. */
export function getBudgetPreviousComparisonSpent(
  chart: BudgetCumulativeSeries | null,
  currentPeriod: DateRange | undefined,
  previousPeriod: DateRange | undefined,
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

  const point = chart.data.findLast(entry => entry.x <= cutoff);
  return point ? point.y : 0;
}
