import { AppConfig } from '@/src/constants/app-config';
import Budget from '@/src/data/models/Budget';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { Flow, SimulationContext } from '../types';

export class BudgetFlowGenerator {
  /**
   * Generates budget-related OUTFLOWs from liquid asset accounts.
   */
  static generate(
    context: SimulationContext,
    budgets: Budget[],
    usages: BudgetUsage[],
    daysLeftInMonth: number,
    nextMonthDays: number,
    budgetCategoryMap: Map<string, Set<string>>,
  ): Flow[] {
    const flows: Flow[] = [];

    const getTargetAssetAccountIds = (budget: Budget): string[] => {
      if (budget.assetAccountIds) {
        const ids = budget.assetAccountIds.split(',').filter((id: string) => id.trim().length > 0);
        if (ids.length > 0) return ids;
      }
      return context.orderedLiquidAccountIds.length > 0 ? [context.orderedLiquidAccountIds[0]] : [];
    };

    for (let i = 0; i < budgets.length; i++) {
      const budget = budgets[i];
      const usage = usages[i];

      const remaining = Math.max(0, usage.remaining);
      if (remaining === 0 && budget.amount === 0) continue;

      const targetAssetIds = getTargetAssetAccountIds(budget);
      if (targetAssetIds.length === 0) continue;

      const budgetCategories = budgetCategoryMap.get(budget.id) || new Set<string>();

      const burns = new Array(context.simulationDays).fill(0);
      const isSmoothed = AppConfig.defaults.budgetMode === 'SMOOTHED';

      if (isSmoothed) {
        const totalInWindow =
          remaining +
          Math.max(0, context.simulationDays - daysLeftInMonth) *
            (budget.amount / Math.max(1, nextMonthDays));
        const smoothedDaily = totalInWindow / context.simulationDays;
        burns.fill(smoothedDaily);
      } else {
        const useConstant30 = AppConfig.insights.useConstant30DayBurn ?? true;
        const minDays = AppConfig.insights.burnRateLookbackMinDays ?? 7;
        const nextMonthDailyRate = budget.amount / (useConstant30 ? 30 : nextMonthDays);
        const currentMonthDailyRate =
          remaining /
          (useConstant30 ? Math.max(daysLeftInMonth, minDays) : Math.max(1, daysLeftInMonth));

        for (let d = 0; d < context.simulationDays; d++) {
          burns[d] = d < daysLeftInMonth ? currentMonthDailyRate : nextMonthDailyRate;
        }
      }

      // Support for RESERVE mode (hypothetical future-proofing or per-budget flag)
      // If we want to support "keeping a balance", we can subtract the reserve from the available liquid balance in the simulator,
      // or emit a "RESERVE" flow that doesn't actually spend but reduces safe-to-spend.
      // For now, these are all OUTFLOWs.

      const shareOfBurn = 1 / targetAssetIds.length;
      const budgetCategoryIds = Array.from(budgetCategories);
      const representativeCategoryId = budgetCategoryIds[0];

      for (const assetId of targetAssetIds) {
        for (let d = 0; d < context.simulationDays; d++) {
          const dailyAmt = burns[d] * shareOfBurn;
          if (dailyAmt > 0.01) {
            flows.push({
              kind: 'OUTFLOW',
              accountId: assetId,
              amount: dailyAmt,
              dayOffset: d,
              meta: {
                source: 'BUDGET',
                label: budget.name,
                referenceId: budget.id,
                categoryId: representativeCategoryId,
                categoryIds: budgetCategoryIds,
              },
            });
          }
        }
      }
    }

    return flows;
  }
}
