import Budget from '@/src/data/models/Budget';
import { BudgetUsage } from '@/src/services/budget/types';
import { BudgetFlowGenerator } from '@/src/services/simulation/engines/BudgetFlowGenerator';
import { Flow, ProjectionProvider, SimulationContext } from '@/src/services/simulation/types';

export interface BudgetProjectionInput {
  budgets: Budget[];
  usages: BudgetUsage[];
  budgetCategoryMap: Map<string, Set<string>>;
}

export class BudgetProjectionProvider implements ProjectionProvider<BudgetProjectionInput> {
  readonly sourceType = 'budget';

  generate(context: SimulationContext, input?: BudgetProjectionInput): Flow[] {
    if (!input) return [];
    return BudgetFlowGenerator.generate(
      context,
      input.budgets,
      input.usages,
      input.budgetCategoryMap,
    );
  }
}

export const budgetProjectionProvider = new BudgetProjectionProvider();
