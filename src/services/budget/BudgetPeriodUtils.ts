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

export class BudgetPeriodUtils {
  /**
   * Calculates the start and end dates for the budget cycle containing the reference date.
   */
  static getCurrentPeriod(
    budget: BudgetPeriodInput,
    referenceDate: number = Date.now(),
  ): DateRange {
    return RecurrenceEngine.getCurrentPeriod(
      {
        intervalType: budget.intervalType || 'MONTHLY',
        intervalN: budget.intervalN || 1,
        startDate: budget.startDate,
        recurrenceDay: budget.recurrenceDay,
        recurrenceMonth: budget.recurrenceMonth,
        createdAt: budget.createdAt,
      },
      referenceDate,
    );
  }

  /**
   * Returns a human-readable string for the budget period.
   */
  static getPeriodLabel(budget: BudgetPeriodInput, referenceDate: number = Date.now()): string {
    return RecurrenceEngine.getPeriodLabel(
      {
        intervalType: budget.intervalType || 'MONTHLY',
        intervalN: budget.intervalN || 1,
        startDate: budget.startDate,
        recurrenceDay: budget.recurrenceDay,
        recurrenceMonth: budget.recurrenceMonth,
        createdAt: budget.createdAt,
      },
      referenceDate,
    );
  }
}
