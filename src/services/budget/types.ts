export interface BudgetUsage {
  spent: number;
  remaining: number;
  budgetAmount: number;
  usagePercent: number;
}

export interface BudgetPeriodRange {
  startOfMonth: number;
  endOfMonth: number;
}
