import {
  buildBudgetSpendingChartGeometry,
  getFractionalCalendarOffset,
} from '../budgetSpendingChartGeometry';
import { budgetCumulativeChartFromData } from '@/src/features/budget/testing/budgetChartTestFixtures';
import dayjs from 'dayjs';

describe('budget spending chart geometry', () => {
  it('retains fractional positions for transactions posted on the same day', () => {
    const start = dayjs('2026-01-01').startOf('day').valueOf();
    const morning = dayjs('2026-01-02T08:00').valueOf();
    const evening = dayjs('2026-01-02T18:00').valueOf();

    const morningOffset = getFractionalCalendarOffset(morning, start);
    const eveningOffset = getFractionalCalendarOffset(evening, start);

    expect(morningOffset).toBeGreaterThan(1);
    expect(eveningOffset).toBeGreaterThan(morningOffset);
    expect(eveningOffset).toBeLessThan(2);
  });

  it('clips both series at today and puts the current dot at cumulative end-of-day spend', () => {
    const currentStart = dayjs('2026-01-01').startOf('day').valueOf();
    const currentEnd = dayjs('2026-01-03').endOf('day').valueOf();
    const previousStart = dayjs('2025-12-01').startOf('day').valueOf();
    const previousEnd = dayjs('2025-12-03').endOf('day').valueOf();
    const today = dayjs('2026-01-02T12:00').valueOf();
    const firstPosting = dayjs('2026-01-02T08:00').valueOf();
    const secondPosting = dayjs('2026-01-02T18:00').valueOf();
    const current = budgetCumulativeChartFromData([
      { x: currentStart, y: 0 },
      { x: firstPosting, y: 0 },
      { x: firstPosting, y: 10 },
      { x: secondPosting, y: 10 },
      { x: secondPosting, y: 20 },
      { x: currentEnd, y: 35 },
    ]);
    const previous = budgetCumulativeChartFromData([
      { x: previousStart, y: 0 },
      { x: dayjs('2025-12-02').endOf('day').valueOf(), y: 15 },
      { x: previousEnd, y: 30 },
    ]);

    const geometry = buildBudgetSpendingChartGeometry({
      chartData: current,
      previousChartData: previous,
      currentPeriod: { startDate: currentStart, endDate: currentEnd },
      previousPeriod: { startDate: previousStart, endDate: previousEnd },
      periodDays: 3,
      elapsedShare: 2 / 3,
      isCurrentPeriod: true,
      now: today,
    });

    expect(geometry.currentPoints.at(-1)?.y).toBe(20);
    expect(geometry.currentPoints.at(-1)?.x).toBeCloseTo(2, 4);
    expect(geometry.currentPoints.some(point => point.y === 35)).toBe(false);
    expect(geometry.currentPoints.find(point => point.x === geometry.todayOffset)?.y).toBe(20);
    expect(geometry.previousPoints.at(-1)?.x).toBeCloseTo(3, 4);
    expect(geometry.previousPoints.at(-1)?.y).toBe(30);
    expect(geometry.previousPoints.some(point => point.x > geometry.todayOffset)).toBe(true);
  });
});
