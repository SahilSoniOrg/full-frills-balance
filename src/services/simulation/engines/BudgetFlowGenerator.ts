import { AppConfig } from '@/src/constants/app-config';
import dayjs from 'dayjs';
import {
  BudgetCapacityProjection,
  Flow,
  FlowCategory,
  FlowSource,
  ScheduledProjection,
  SimulationContext,
} from '../types';
import { assertValidFlow } from '../utils/FlowInvariants';

export class BudgetFlowGenerator {
  /**
   * Materializes residual budget capacity into daily estimated burn flows,
   * taking into account matched planned obligations within cycle periods.
   * Delayed discretization: Reconciles cycle-level capacity facts before discretizing into daily flows.
   */
  static materializeFlows(
    context: SimulationContext,
    capacities: BudgetCapacityProjection[],
    scheduledProjections: ScheduledProjection[] = [],
  ): Flow[] {
    const budgetFlows: Flow[] = [];

    // Pre-group relevant planned projections by category for faster lookup
    const plannedByCategoryId = new Map<string, ScheduledProjection[]>();
    for (const p of scheduledProjections) {
      if (p.categoryId) {
        const list = plannedByCategoryId.get(p.categoryId) || [];
        list.push(p);
        plannedByCategoryId.set(p.categoryId, list);
      }
    }

    const startOfSim = dayjs(context.simulationStartMs).startOf('day');

    for (const proj of capacities) {
      const { budgetId, name, accountScope, targetAssetAccountIds, cycles } = proj;
      if (cycles.length === 0 || targetAssetAccountIds.length === 0) continue;

      const budgetCategoryIds = Array.from(accountScope);
      const representativeCategoryId = budgetCategoryIds[0];
      const shareOfBurn = 1 / targetAssetAccountIds.length;

      const dailyBurns = new Array(context.simulationDays).fill(0);

      // Collect all matching planned projections for this budget
      const matchingScheduled: ScheduledProjection[] = [];
      accountScope.forEach(catId => {
        const list = plannedByCategoryId.get(catId) || [];
        list.forEach(p => {
          if (!matchingScheduled.includes(p)) {
            matchingScheduled.push(p);
          }
        });
      });

      // Cycle-aware reconciliation per individual cycle
      for (let cycleIndex = 0; cycleIndex < cycles.length; cycleIndex++) {
        const cycle = cycles[cycleIndex];
        const isCurrentCycle = cycleIndex === 0;

        const cyclePlanned = matchingScheduled.filter(p => {
          const effectiveOccurrence = Math.max(p.occurrenceDate, context.simulationStartMs);
          return effectiveOccurrence >= cycle.startDate && effectiveOccurrence <= cycle.endDate;
        });
        const plannedInCycle = cyclePlanned.reduce((sum, p) => sum + p.amount, 0);
        const effectiveCycleRemaining = Math.max(0, cycle.remainingCapacity - plannedInCycle);

        if (effectiveCycleRemaining <= AppConfig.defaults.simulation.financialEpsilon) {
          continue;
        }

        // Calculate active day window in simulation
        const cycleStartOffset = Math.max(
          0,
          dayjs(cycle.startDate).startOf('day').diff(startOfSim, 'day'),
        );
        const cycleEndOffset = Math.min(
          context.simulationDays - 1,
          dayjs(cycle.endDate).startOf('day').diff(startOfSim, 'day'),
        );

        if (cycleStartOffset > cycleEndOffset) continue;

        const totalCycleDays = Math.max(
          1,
          dayjs(cycle.endDate).startOf('day').diff(dayjs(cycle.startDate).startOf('day'), 'day') +
            1,
        );
        const plannedDayOffsets = new Set(
          cyclePlanned.map(p => {
            const effectiveMs = Math.max(p.occurrenceDate, context.simulationStartMs);
            return dayjs(effectiveMs).startOf('day').diff(startOfSim, 'day');
          }),
        );
        const nonPlannedDays: number[] = [];

        for (let d = cycleStartOffset; d <= cycleEndOffset; d++) {
          if (!plannedDayOffsets.has(d)) {
            nonPlannedDays.push(d);
          }
        }

        const targetDays =
          nonPlannedDays.length > 0
            ? nonPlannedDays
            : Array.from(
                { length: cycleEndOffset - cycleStartOffset + 1 },
                (_, i) => cycleStartOffset + i,
              );

        // For the active (current) cycle, remaining capacity represents what is left from simulation start to cycle end,
        // so its denominator is the active eligible days within the simulation window (targetDays.length).
        // For future complete cycles, capacity represents the full cycle, so its denominator is the full cycle's eligible days.
        const cyclePlannedDaysCount = plannedDayOffsets.size;
        const fullCycleNonPlannedDaysCount = Math.max(
          1,
          nonPlannedDays.length > 0 ? totalCycleDays - cyclePlannedDaysCount : totalCycleDays,
        );

        const eligibleDaysDenominator = isCurrentCycle
          ? Math.max(1, targetDays.length)
          : fullCycleNonPlannedDaysCount;

        const dailyRate = effectiveCycleRemaining / eligibleDaysDenominator;
        for (const d of targetDays) {
          if (d >= 0 && d < context.simulationDays) {
            dailyBurns[d] += dailyRate;
          }
        }
      }

      // Emit OUTFLOW flows for target funding accounts
      for (const assetId of targetAssetAccountIds) {
        for (let d = 0; d < context.simulationDays; d++) {
          const dailyAmt = dailyBurns[d] * shareOfBurn;
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
              referenceId: String(budgetId),
            });
          }
        }
      }
    }

    budgetFlows.forEach(assertValidFlow);
    return budgetFlows;
  }
}
