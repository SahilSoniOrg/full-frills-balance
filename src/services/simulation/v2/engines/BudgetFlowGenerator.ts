import Budget from '@/src/data/models/Budget';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { Flow } from '../types';
import { AppConfig } from '@/src/constants/app-config';

export class BudgetFlowGenerator {
  /**
   * Generates budget-related OUTFLOWs from liquid asset accounts.
   */
  static generate(
    budgets: any[],
    usages: BudgetUsage[],
    liquidAssetIds: string[],
    simulationDays: number,
    daysLeftInMonth: number,
    nextMonthDays: number,
    budgetCategoryMap: Map<string, Set<string>>,
  ): Flow[] {
    const flows: Flow[] = [];

    const getTargetAssetAccountIds = (budget: Budget): string[] => {
      if (budget.assetAccountIds) {
        const ids = budget.assetAccountIds.split(',').filter(id => id.trim().length > 0);
        if (ids.length > 0) return ids;
      }
      return liquidAssetIds.length > 0 ? [liquidAssetIds[0]] : [];
    };

    for (let i = 0; i < budgets.length; i++) {
      const budget = budgets[i];
      const usage = usages[i];

      const remaining = Math.max(0, usage.remaining);
      if (remaining === 0 && budget.amount === 0) continue;

      const targetAssetIds = getTargetAssetAccountIds(budget);
      if (targetAssetIds.length === 0) continue;

      const isSmoothed = AppConfig.defaults.budgetMode === 'SMOOTHED';
      const burns = new Array(simulationDays).fill(0);

      if (isSmoothed) {
        const totalInWindow =
          remaining +
          Math.max(0, simulationDays - daysLeftInMonth) *
            (budget.amount / Math.max(1, nextMonthDays));
        const smoothedDaily = totalInWindow / simulationDays;
        burns.fill(smoothedDaily);
      } else {
        const useConstant30 = AppConfig.insights.useConstant30DayBurn ?? true;
        const minDays = AppConfig.insights.burnRateLookbackMinDays ?? 7;
        const nextMonthDailyRate = budget.amount / (useConstant30 ? 30 : nextMonthDays);
        const currentMonthDailyRate =
          remaining /
          (useConstant30 ? Math.max(daysLeftInMonth, minDays) : Math.max(1, daysLeftInMonth));

        for (let d = 0; d < simulationDays; d++) {
          burns[d] = d < daysLeftInMonth ? currentMonthDailyRate : nextMonthDailyRate;
        }
      }

      // Emit OUTFLOWs
      const shareOfBurn = 1 / targetAssetIds.length;
      const budgetCategories = Array.from(budgetCategoryMap.get(budget.id) || []);
      const representativeCategoryId =
        budgetCategories.length > 0 ? budgetCategories[0] : undefined;

      for (const assetId of targetAssetIds) {
        for (let d = 0; d < simulationDays; d++) {
          const dailyAmt = burns[d] * shareOfBurn;
          if (dailyAmt > 0) {
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
                categoryIds: budgetCategories,
              },
            });
          }
        }
      }
    }

    return flows;
  }
}
