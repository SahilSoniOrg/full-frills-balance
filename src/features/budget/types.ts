import { BudgetUsage } from '@/src/services/budget/types';
import { PlainBudget } from '@/src/types/plainDtos';

export interface BudgetItem {
  budget: PlainBudget;
  usage: BudgetUsage;
  previousUsage?: BudgetUsage;
}
