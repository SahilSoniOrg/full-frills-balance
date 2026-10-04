import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { roundToPrecision } from '@/src/utils/money';
import { budgetFormStrings } from '@/src/constants/copy/domains/budgetFormStrings';

export type BudgetSpendingPeriod = {
  label: string;
  startDate: number;
  endDate: number;
  spent: number;
};

export function formatBudgetAmountLabel(intervalType: string, intervalN: number): string {
  const unit =
    intervalType === 'DAILY'
      ? budgetFormStrings.intervalUnits.day
      : intervalType === 'WEEKLY'
        ? budgetFormStrings.intervalUnits.week
        : intervalType === 'YEARLY'
          ? budgetFormStrings.intervalUnits.year
          : budgetFormStrings.intervalUnits.month;
  return intervalN > 1
    ? budgetFormStrings.limitEvery(intervalN, unit)
    : budgetFormStrings.limitEach(unit);
}

export function calculateAverageSpend(
  periods: BudgetSpendingPeriod[],
  transactionCounts: number[],
  currencyCode: string,
  unvaluedPeriods: boolean[] = [],
) {
  if (unvaluedPeriods.slice(0, -1).some(Boolean)) return null;
  const completed = periods.slice(0, -1).filter((_, index) => transactionCounts[index] > 0);
  if (completed.length === 0) return null;
  const precision = getCurrencyPrecision(currencyCode);
  return roundToPrecision(
    completed.reduce((sum, period) => sum + period.spent, 0) / completed.length,
    precision,
  );
}
