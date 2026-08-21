import { BudgetUsage } from '@/src/services/budget/types';
import { PlainBudget } from '@/src/types/domain';

export interface BudgetItem {
  budget: PlainBudget;
  usage: BudgetUsage;
  previousUsage?: BudgetUsage;
}
