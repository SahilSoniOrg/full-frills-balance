import { RecurrenceEngine } from '@/src/services/forward-finance/recurrence/RecurrenceEngine';
import { DateRange } from '@/src/services/forward-finance/recurrence/types';

export type { DateRange };

export interface BudgetPeriodInput {
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  createdAt?: Date | number;
}

function toRecurrenceRule(budget: BudgetPeriodInput) {
  return {
    intervalType: budget.intervalType || 'MONTHLY',
    intervalN: budget.intervalN || 1,
    startDate: budget.startDate,
    recurrenceDay: budget.recurrenceDay,
    recurrenceMonth: budget.recurrenceMonth,
    createdAt: budget.createdAt,
  };
}

/** Calculates the start and end dates for the budget cycle containing the reference date. */
export function getBudgetCurrentPeriod(
  budget: BudgetPeriodInput,
  referenceDate: number = Date.now(),
): DateRange {
  return RecurrenceEngine.getCurrentPeriod(toRecurrenceRule(budget), referenceDate);
}

/** Returns a human-readable string for the budget period. */
export function getBudgetPeriodLabel(
  budget: BudgetPeriodInput,
  referenceDate: number = Date.now(),
): string {
  return RecurrenceEngine.getPeriodLabel(toRecurrenceRule(budget), referenceDate);
}
