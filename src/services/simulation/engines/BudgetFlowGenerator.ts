import { AppConfig } from '@/src/constants/app-config';
import Budget from '@/src/data/models/Budget';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { AccountId } from '@/src/types/domain';
import dayjs from 'dayjs';
import { BudgetPeriodUtils } from '../../budget/BudgetPeriodUtils';
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

    const getTargetAssetAccountIds = (budget: Budget): AccountId[] => {
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

      const remaining = Math.max(0, usage.remaining);
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

      // Subtract planned flows that match this budget's categories
      let currentCyclePlannedTotal = 0;
      let nextCyclePlannedTotal = 0;

      budgetCategories.forEach(catId => {
        const matching = plannedByCategoryId.get(catId) || [];
        matching.forEach(f => {
          if (f.dayOffset < daysLeftInCycle) {
            currentCyclePlannedTotal += f.amount;
          } else {
            nextCyclePlannedTotal += f.amount;
          }
        });
      });

      // Current + next cycle only describe the whole window for long cadences. Short
      // ones (daily/weekly) recur many times inside it, so post-cycle planned spend
      // belongs to several cycles rather than being charged against a single one.
      const futureCycles = Math.max(
        1,
        Math.ceil((context.simulationDays - daysLeftInCycle) / nextCycleDays),
      );
      const windowSpansExtraCycles = daysLeftInCycle + nextCycleDays < context.simulationDays;

      const effectiveRemaining = Math.max(0, usage.remaining - currentCyclePlannedTotal);
      const effectiveNextCycleTotal = Math.max(
        0,
        budget.amount - nextCyclePlannedTotal / futureCycles,
      );

      if (effectiveRemaining === 0 && effectiveNextCycleTotal === 0 && budget.amount === 0)
        continue;

      const burns = new Array(context.simulationDays).fill(0);
      const isSmoothed = AppConfig.defaults.budgetMode === 'SMOOTHED';
      const intervalType = budget.intervalType || 'MONTHLY';
      // Constant-30 smoothing is a monthly heuristic; other cadences must use real cycle length.
      const useConstant30 =
        (AppConfig.insights.useConstant30DayBurn ?? true) && intervalType === 'MONTHLY';

      // Averaging across the window would smear an already-spent cycle over later ones,
      // so it only applies when the window holds no cycles beyond the next.
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
              meta: {
                tags: d < daysLeftInCycle ? ['CURRENT_CYCLE'] : [],
              },
            });
          }
        }
      }
    }

    flows.forEach(assertValidFlow);
    return flows;
  }
}
