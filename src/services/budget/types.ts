import type { MissingRateQuote } from '@/src/services/reports-v2/types/result';
import type { BudgetUnvaluedCurrencyCount } from './budgetUnvaluedEntries';

export interface BudgetUsage {
  spent: number;
  remaining: number;
  budgetAmount: number;
  usagePercent: number;
  /** True when one or more journal lines could not be valued for this period. */
  hasUnvaluedEntries?: boolean;
  unvaluedEntryCount?: number;
  unvaluedCurrencyCounts?: BudgetUnvaluedCurrencyCount[];
  /** Historical rates (pair + journal date) the valuation could not find. */
  missingRateQuotes?: MissingRateQuote[];
}
