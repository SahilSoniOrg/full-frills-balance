import { AppConfig } from '@/src/constants/app-config';
import {
  BudgetCapacityProjection,
  Flow,
  FlowCategory,
  FlowSource,
  SimulationContext,
} from '../types';
import { assertValidFlow } from '../utils/FlowInvariants';

export class BudgetFlowGenerator {
  /**
   * Materializes residual budget capacity into daily estimated burn flows,
   * taking into account matched planned obligations within cycle periods.
   */
  static materializeFlows(
    context: SimulationContext,
    capacities: BudgetCapacityProjection[],
    plannedFlows: Flow[] = [],
  ): { budgetFlows: Flow[] } {
    const budgetFlows: Flow[] = [];

    // Pre-group relevant planned flows by category for faster lookup
    const plannedByCategoryId = new Map<string, Flow[]>();
    plannedFlows.forEach(f => {
      if (f.categoryId) {
        const list = plannedByCategoryId.get(f.categoryId) || [];
        list.push(f);
        plannedByCategoryId.set(f.categoryId, list);
      }
    });

    for (const proj of capacities) {
      const {
        budgetId,
        name,
        cycleAmount,
        usageRemaining,
        intervalType,
        accountScope,
        targetAssetAccountIds,
        daysLeftInCycle,
        nextCycleDays,
        windowSpansExtraCycles,
        futureCycles,
      } = proj;

      // Subtract planned flows that match this budget's categories
      let currentCyclePlannedTotal = 0;
      let nextCyclePlannedTotal = 0;

      accountScope.forEach(catId => {
        const matching = plannedByCategoryId.get(catId) || [];
        matching.forEach(f => {
          if (f.dayOffset < daysLeftInCycle) {
            currentCyclePlannedTotal += f.amount;
          } else {
            nextCyclePlannedTotal += f.amount;
          }
        });
      });

      const effectiveRemaining = Math.max(0, usageRemaining - currentCyclePlannedTotal);
      const effectiveNextCycleTotal = Math.max(
        0,
        cycleAmount - nextCyclePlannedTotal / futureCycles,
      );

      if (effectiveRemaining === 0 && effectiveNextCycleTotal === 0 && cycleAmount === 0) continue;

      const burns = new Array(context.simulationDays).fill(0);
      const isSmoothed = AppConfig.defaults.budgetMode === 'SMOOTHED';
      const useConstant30 =
        (AppConfig.insights.useConstant30DayBurn ?? true) && intervalType === 'MONTHLY';

      if (isSmoothed && !windowSpansExtraCycles) {
        const totalInWindow =
          effectiveRemaining +
          Math.max(0, context.simulationDays - daysLeftInCycle) *
            (effectiveNextCycleTotal / nextCycleDays);
        const smoothedDaily = totalInWindow / context.simulationDays;
        burns.fill(smoothedDaily);
      } else {
        const minDays = AppConfig.insights.burnRateLookbackMinDays ?? 7;
        const nextCycleDailyRate =
          effectiveNextCycleTotal /
          (useConstant30 ? AppConfig.insights.constantDaysInMonth : nextCycleDays);
        const currentCycleDailyRate =
          effectiveRemaining /
          (useConstant30 ? Math.max(daysLeftInCycle, minDays) : Math.max(1, daysLeftInCycle));

        for (let d = 0; d < context.simulationDays; d++) {
          burns[d] = d < daysLeftInCycle ? currentCycleDailyRate : nextCycleDailyRate;
        }
      }

      const shareOfBurn = 1 / targetAssetAccountIds.length;
      const budgetCategoryIds = Array.from(accountScope);
      const representativeCategoryId = budgetCategoryIds[0];

      for (const assetId of targetAssetAccountIds) {
        for (let d = 0; d < context.simulationDays; d++) {
          const dailyAmt = burns[d] * shareOfBurn;
          if (dailyAmt > AppConfig.defaults.simulation.financialEpsilon) {
            budgetFlows.push({
              kind: 'OUTFLOW',
              accountId: assetId,
              amount: dailyAmt,
              dayOffset: d,
              category: FlowCategory.BUDGET,
              timeframe: 'FUTURE',
              label: name,
              origin: FlowSource.BUDGET,
              categoryId: representativeCategoryId,
              referenceId: budgetId,
              meta: {
                tags: d < daysLeftInCycle ? ['CURRENT_CYCLE'] : [],
              },
            });
          }
        }
      }
    }

    budgetFlows.forEach(assertValidFlow);
    return { budgetFlows };
  }
}
