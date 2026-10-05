import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import dayjs from 'dayjs';

export function budgetCumulativeChartFixture(
  start: number,
  end: number,
  sameDaySpend = 90,
): BudgetCumulativeChart {
  return {
    domainX: [start, end],
    data: [
      { x: start, y: 0 },
      { x: dayjs(start).add(2, 'day').endOf('day').valueOf(), y: sameDaySpend },
      { x: dayjs(start).add(3, 'day').valueOf(), y: 120 },
      { x: end, y: 300 },
    ],
    categories: [],
    entryCount: 2,
    refunds: 0,
    hasUnvaluedEntries: false,
  };
}

export function budgetCumulativeChartFromData(
  data: BudgetCumulativeChart['data'],
): BudgetCumulativeChart {
  return {
    data,
    domainX: [data[0]?.x ?? 0, data.at(-1)?.x ?? 0],
    hasUnvaluedEntries: false,
    categories: [],
    entryCount: 0,
    refunds: 0,
  };
}
