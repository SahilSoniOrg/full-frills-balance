import { BudgetUsage } from '@/src/services/budget/types';
import { AccountId } from '@/src/types/domain';
import dayjs from 'dayjs';
import { BudgetPeriodUtils } from './BudgetPeriodUtils';
import {
  BudgetCapacityProjection,
  ProjectionProvider,
  SimulationBudget,
  SimulationContext,
} from '@/src/services/simulation/types';

export interface BudgetProjectionInput {
  budgets: SimulationBudget[];
  usages: BudgetUsage[];
  budgetCategoryMap: Map<string, Set<string>>;
}

export class BudgetProjectionProvider implements ProjectionProvider<
  BudgetProjectionInput,
  BudgetCapacityProjection[]
> {
  readonly sourceType = 'budget';

  generate(context: SimulationContext, input: BudgetProjectionInput): BudgetCapacityProjection[] {
    return this.projectCapacities(context, input.budgets, input.usages, input.budgetCategoryMap);
  }

  /**
   * Projects high-level semantic budget capacity across cycle periods.
   * Delayed discretization: Does NOT flatten budget into daily flows yet.
   */
  projectCapacities(
    context: SimulationContext,
    budgets: SimulationBudget[],
    usages: BudgetUsage[],
    budgetCategoryMap: Map<string, Set<string>>,
  ): BudgetCapacityProjection[] {
    const projections: BudgetCapacityProjection[] = [];

    const getTargetAssetAccountIds = (budget: SimulationBudget): AccountId[] => {
      if (budget.assetAccountIds) {
        const ids = budget.assetAccountIds
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean) as AccountId[];
        if (ids.length > 0) return ids;
      }
      return context.orderedLiquidAccountIds.length > 0 ? [context.orderedLiquidAccountIds[0]] : [];
    };

    for (let i = 0; i < budgets.length; i++) {
      const budget = budgets[i];
      const usage = usages[i];

      const remaining = Math.max(0, usage?.remaining ?? 0);
      if (remaining === 0 && budget.amount === 0) continue;

      const targetAssetIds = getTargetAssetAccountIds(budget);
      if (targetAssetIds.length === 0) continue;

      const budgetCategories = budgetCategoryMap.get(budget.id) || new Set<string>();

      const { endDate } = BudgetPeriodUtils.getCurrentPeriod(budget, context.simulationStartMs);
      const daysLeftInCycle = Math.max(
        1,
        dayjs(endDate).diff(dayjs(context.simulationStartMs), 'day') + 1,
      );

      const nextCycleStart = dayjs(endDate).add(1, 'ms').valueOf();
      const nextCycleRange = BudgetPeriodUtils.getCurrentPeriod(budget, nextCycleStart);
      const nextCycleDays = Math.max(
        1,
        dayjs(nextCycleRange.endDate).diff(dayjs(nextCycleRange.startDate), 'day') + 1,
      );

      const windowSpansExtraCycles = daysLeftInCycle + nextCycleDays < context.simulationDays;
      const futureCycles = Math.max(
        1,
        Math.ceil((context.simulationDays - daysLeftInCycle) / nextCycleDays),
      );

      projections.push({
        budgetId: budget.id,
        name: budget.name,
        cycleAmount: budget.amount,
        usageRemaining: remaining,
        intervalType: budget.intervalType || 'MONTHLY',
        accountScope: budgetCategories,
        targetAssetAccountIds: targetAssetIds,
        daysLeftInCycle,
        nextCycleDays,
        windowSpansExtraCycles,
        futureCycles,
      });
    }

    return projections;
  }
}

export const budgetProjectionProvider = new BudgetProjectionProvider();
