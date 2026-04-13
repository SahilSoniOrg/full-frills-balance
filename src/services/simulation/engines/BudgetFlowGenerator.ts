import { AppConfig } from '@/src/constants/app-config';
import Budget from '@/src/data/models/Budget';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { Flow, FlowCategory, FlowSource, SimulationContext } from '../types';
import { assertValidFlow } from '../utils/FlowInvariants';

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
    plannedFlows: Flow[] = [],
  ): Flow[] {
    const flows: Flow[] = [];

    // Pre-group relevant planned flows by category for faster lookup
    const plannedByCategoryId = new Map<string, Flow[]>();
    plannedFlows.forEach(f => {
      if (f.categoryId) {
        const list = plannedByCategoryId.get(f.categoryId) || [];
        list.push(f);
        plannedByCategoryId.set(f.categoryId, list);
      }
    });

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

      // Subtract planned flows that match this budget's categories
      let currentMonthPlannedTotal = 0;
      let nextMonthPlannedTotal = 0;

      budgetCategories.forEach(catId => {
        const matching = plannedByCategoryId.get(catId) || [];
        matching.forEach(f => {
          if (f.dayOffset < daysLeftInMonth) {
            currentMonthPlannedTotal += f.amount;
          } else {
            nextMonthPlannedTotal += f.amount;
          }
        });
      });

      const effectiveRemaining = Math.max(0, usage.remaining - currentMonthPlannedTotal);
      const effectiveNextMonthTotal = Math.max(0, budget.amount - nextMonthPlannedTotal);

      if (effectiveRemaining === 0 && effectiveNextMonthTotal === 0 && budget.amount === 0)
        continue;

      const burns = new Array(context.simulationDays).fill(0);
      const isSmoothed = AppConfig.defaults.budgetMode === 'SMOOTHED';

      if (isSmoothed) {
        const totalInWindow =
          effectiveRemaining +
          Math.max(0, context.simulationDays - daysLeftInMonth) *
            (effectiveNextMonthTotal / Math.max(1, nextMonthDays));
        const smoothedDaily = totalInWindow / context.simulationDays;
        burns.fill(smoothedDaily);
      } else {
        const useConstant30 = AppConfig.insights.useConstant30DayBurn ?? true;
        const minDays = AppConfig.insights.burnRateLookbackMinDays ?? 7;
        const nextMonthDailyRate =
          effectiveNextMonthTotal /
          (useConstant30 ? AppConfig.insights.constantDaysInMonth : nextMonthDays);
        const currentMonthDailyRate =
          effectiveRemaining /
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
          if (dailyAmt > AppConfig.defaults.simulation.financialEpsilon) {
            flows.push({
              kind: 'OUTFLOW',
              accountId: assetId,
              amount: dailyAmt,
              dayOffset: d,
              category: FlowCategory.BUDGET,
              timeframe: 'FUTURE',
              label: budget.name,
              origin: FlowSource.BUDGET,
              categoryId: representativeCategoryId,
              referenceId: budget.id,
            });
          }
        }
      }
    }

    flows.forEach(assertValidFlow);
    return flows;
  }
}
