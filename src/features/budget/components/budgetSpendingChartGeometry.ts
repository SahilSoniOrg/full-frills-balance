import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import dayjs from 'dayjs';

type PeriodRange = { startDate: number; endDate: number };
type Point = { x: number; y: number };

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
  currentPeriod: PeriodRange;
  previousPeriod?: PeriodRange;
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
