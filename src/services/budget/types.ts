export interface BudgetUsage {
  spent: number;
  remaining: number;
  budgetAmount: number;
  usagePercent: number;
  /** True when one or more journal lines could not be valued for this period. */
  hasUnvaluedEntries?: boolean;
}
