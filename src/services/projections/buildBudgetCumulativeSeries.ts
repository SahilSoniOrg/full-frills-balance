import { safeAdd, safeSubtract } from '@/src/utils/money';
import dayjs from 'dayjs';

export type ChartPoint = { x: number; y: number };

export type BudgetCumulativeTx = {
  transactionDate: number;
  /** Amount already converted to the budget currency at the journal date. */
  amount: number;
  transactionType: string;
};

export type BuildBudgetCumulativeSeriesInput = {
  transactions: BudgetCumulativeTx[];
  periodStart: number;
  periodEnd: number;
  precision: number;
};

export type BudgetCumulativeSeries = {
  data: ChartPoint[];
  domainX: [number, number];
};

/**
 * Builds a day-anchored step series of cumulative budget spend over a period.
 * Transactions must already be valued in the budget currency.
 */
export function buildBudgetCumulativeSeries(
  input: BuildBudgetCumulativeSeriesInput,
): BudgetCumulativeSeries {
  const { transactions, periodStart, periodEnd, precision } = input;

  const sortedTxs = [...transactions].sort((a, b) => a.transactionDate - b.transactionDate);
  const data: ChartPoint[] = [];
  let cumulativeSpent = 0;

  const startOfCycle = dayjs(periodStart);
  const endOfCycle = dayjs(periodEnd);
  const daysInCycle = endOfCycle.diff(startOfCycle, 'day') + 1;

  let txIndex = 0;

  for (let d = 0; d < daysInCycle; d++) {
    const currentDay = startOfCycle.add(d, 'day');
    const dayStart = currentDay.startOf('day').valueOf();
    const dayEnd = currentDay.endOf('day').valueOf();

    data.push({ x: dayStart, y: cumulativeSpent });

    while (
      txIndex < sortedTxs.length &&
      dayjs(sortedTxs[txIndex].transactionDate).isSame(currentDay, 'day')
    ) {
      const tx = sortedTxs[txIndex];
      const amount = tx.amount;

      data.push({ x: tx.transactionDate, y: cumulativeSpent });

      if (tx.transactionType === 'DEBIT') {
        cumulativeSpent = safeAdd(cumulativeSpent, amount, precision);
      } else if (tx.transactionType === 'CREDIT') {
        cumulativeSpent = safeSubtract(cumulativeSpent, amount, precision);
      }

      data.push({ x: tx.transactionDate, y: cumulativeSpent });
      txIndex++;
    }

    data.push({ x: dayEnd, y: cumulativeSpent });
  }

  if (data.length === 0) {
    data.push({ x: periodStart, y: 0 });
  }

  return {
    data,
    domainX: [periodStart, periodEnd],
  };
}
