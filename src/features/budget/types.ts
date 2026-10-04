import { BudgetUsage } from '@/src/services/budget/types';
import { PlainAccount, PlainBudget } from '@/src/types/plainDtos';

export interface BudgetItem {
  budget: PlainBudget;
  usage: BudgetUsage;
  /** `undefined` entries are accounts that no longer resolve. */
  scopeAccounts: (PlainAccount | undefined)[];
}
