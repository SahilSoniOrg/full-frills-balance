import { BudgetUsage } from '@/src/services/budget/types';
import { AccountId } from '@/src/types/ids';
import dayjs from 'dayjs';
import { BudgetPeriodUtils } from './BudgetPeriodUtils';
import {
  BudgetCapacityProjection,
  BudgetCycleCapacity,
  SimulationBudget,
  SimulationContext,
} from '@/src/services/simulation/types';

export class BudgetProjectionProvider {
  /**
   * Projects high-level semantic budget capacity across cycle periods.
   * Delayed discretization: Emits explicit cycles without premature discretization into daily flows.
   */
  projectCapacities(
    context: SimulationContext,
    budgets: SimulationBudget[],
    usages: BudgetUsage[],
    budgetCategoryMap: Map<string, Set<string>>,
  ): BudgetCapacityProjection[] {
    const projections: BudgetCapacityProjection[] = [];
    const startOfSim = dayjs(context.simulationStartMs).startOf('day');

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

      // Generate all cycles that overlap the simulation window [simulationStartMs, simulationEndMs]
      const cycles: BudgetCycleCapacity[] = [];

      let currentPeriod = BudgetPeriodUtils.getCurrentPeriod(budget, context.simulationStartMs);
      cycles.push({
        startDate: currentPeriod.startDate,
        endDate: currentPeriod.endDate,
        capacity: budget.amount,
        remainingCapacity: remaining,
      });

      // Walk forward to collect future cycles within the simulation window
      while (currentPeriod.endDate < context.simulationEndMs) {
        const nextCycleRef = dayjs(currentPeriod.endDate).add(1, 'second').valueOf();
        const nextPeriod = BudgetPeriodUtils.getCurrentPeriod(budget, nextCycleRef);

        // Guard against infinite loop if period doesn't advance
        if (nextPeriod.startDate <= currentPeriod.startDate) break;

        const nextStartOffset = dayjs(nextPeriod.startDate).startOf('day').diff(startOfSim, 'day');
        if (nextStartOffset >= context.simulationDays) break;

        cycles.push({
          startDate: nextPeriod.startDate,
          endDate: nextPeriod.endDate,
          capacity: budget.amount,
          remainingCapacity: budget.amount,
        });

        currentPeriod = nextPeriod;
      }

      projections.push({
        budgetId: budget.id,
        name: budget.name,
        accountScope: budgetCategories,
        targetAssetAccountIds: targetAssetIds,
        intervalType: budget.intervalType || 'MONTHLY',
        cycles,
      });
    }

    return projections;
  }
}

export const budgetProjectionProvider = new BudgetProjectionProvider();
