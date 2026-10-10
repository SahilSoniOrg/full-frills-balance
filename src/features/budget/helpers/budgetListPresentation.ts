import { getBudgetCurrentPeriod } from '@/src/services/budget/BudgetPeriodUtils';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { headlineCurrency, safeAdd, safeSubtract } from '@/src/utils/money';
import { BudgetItem } from '../types';
import { presentBudgetPeriod } from './budgetDetailPresentation';
import { resolveBudgetStatus, type BudgetStatus } from './budgetCardPresentation';

const STATUS_ORDER: Record<BudgetStatus, number> = {
  over: 0,
  nearLimit: 1,
  aheadOfPace: 2,
  onPace: 3,
};

export function sortBudgetItems(items: BudgetItem[], now: number): BudgetItem[] {
  const rank = (item: BudgetItem) => {
    const range = getBudgetCurrentPeriod(item.budget, now);
    const period = presentBudgetPeriod(range, item.usage, now);
    const status = resolveBudgetStatus(item.usage.usagePercent, period.elapsedShare).status;
    return item.usage.spent <= 0 && status === 'onPace' ? 4 : STATUS_ORDER[status];
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || a.budget.name.localeCompare(b.budget.name));
}

/** Raw money only: the view formats every amount through the privacy-aware money APIs. */
export function summarizeBudgetList(items: BudgetItem[], workplaceCurrency: string, now: number) {
  // Restrict the headline to one-month cycles. Never mix weekly/quarterly capacity into it.
  const monthly = items.filter(
    ({ budget }) =>
      (!budget.intervalType || budget.intervalType === 'MONTHLY') && (budget.intervalN || 1) === 1,
  );
  const currencyCode = headlineCurrency(
    monthly.map(({ budget }) => budget.currencyCode),
    workplaceCurrency,
  );
  const included = monthly.filter(item => item.budget.currencyCode === currencyCode);
  const precision = getCurrencyPrecision(currencyCode);
  const limit = included.reduce((sum, item) => safeAdd(sum, item.usage.budgetAmount, precision), 0);
  const spent = included.reduce((sum, item) => safeAdd(sum, item.usage.spent, precision), 0);
  const ranges = included.map(item => getBudgetCurrentPeriod(item.budget, now));
  const range = ranges[0];
  // Monthly budgets can be anchored to different days. Only label a common period.
  const commonRange =
    range &&
    ranges.every(other => other.startDate === range.startDate && other.endDate === range.endDate)
      ? range
      : undefined;
  const usage = {
    spent,
    remaining: safeSubtract(limit, spent, precision),
    budgetAmount: limit,
    usagePercent: limit > 0 ? spent / limit : 0,
    hasUnvaluedEntries: included.some(item => item.usage.hasUnvaluedEntries),
  };
  return {
    currencyCode,
    usage,
    otherCurrencyCount: monthly.length - included.length,
    excludedCadenceCount: items.length - monthly.length,
    overCount: included.filter(item => item.usage.spent >= item.usage.budgetAmount).length,
    periodRange: commonRange,
    period: commonRange ? presentBudgetPeriod(commonRange, usage, now) : undefined,
  };
}
