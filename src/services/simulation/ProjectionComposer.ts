import dayjs from 'dayjs';
import { BudgetFlowGenerator } from './engines/BudgetFlowGenerator';
import {
  BudgetCapacityProjection,
  Flow,
  FlowCategory,
  FlowSource,
  ScheduledProjection,
  SimulationContext,
} from './types';
import { assertValidFlow } from './utils/FlowInvariants';

export class ProjectionComposer {
  /**
   * Reconciles Budget Intent vs Scheduled Intent via Delayed Discretization.
   * Consumes semantic budget capacity projections and scheduled projections,
   * reconciles cycle-level capacities against matching planned outflows, materializes
   * residual daily budget burn flows, and produces unified simulation flows.
   */
  static composeSpending(
    budgetCapacities: BudgetCapacityProjection[],
    scheduledProjections: ScheduledProjection[],
    context: SimulationContext,
  ): Flow[] {
    const budgetFlows = BudgetFlowGenerator.materializeFlows(
      context,
      budgetCapacities,
      scheduledProjections,
    );

    const plannedFlows = this.materializeScheduledProjections(
      scheduledProjections,
      context,
      budgetCapacities,
    );

    const allFlows = [...budgetFlows, ...plannedFlows];
    allFlows.forEach(assertValidFlow);
    return allFlows;
  }

  /**
   * Materializes semantic ScheduledProjection[] into concrete timeline Flow[] objects,
   * calculating concrete dayOffset relative to simulation timeline.
   */
  static materializeScheduledProjections(
    scheduled: ScheduledProjection[],
    context: SimulationContext,
    budgetCapacities: BudgetCapacityProjection[] = [],
  ): Flow[] {
    const flows: Flow[] = [];
    const startOfSim = dayjs(context.simulationStartMs).startOf('day');

    const coveredCategories = new Set<string>();
    for (const b of budgetCapacities) {
      b.accountScope.forEach(cat => coveredCategories.add(cat));
    }

    for (const p of scheduled) {
      const isBudgetReconciled = !!(p.categoryId && coveredCategories.has(p.categoryId));
      const resolution = isBudgetReconciled ? 'MERGED' : undefined;
      const resolvedFrom = isBudgetReconciled ? FlowSource.PLANNED_PAYMENT : undefined;

      const effectiveMs = Math.max(p.occurrenceDate, context.simulationStartMs);
      const dayOffset = Math.max(0, dayjs(effectiveMs).startOf('day').diff(startOfSim, 'day'));

      if (dayOffset >= context.simulationDays) continue;

      if (p.isTransfer) {
        flows.push({
          kind: 'TRANSFER',
          fromAccountId: p.fromAccountId,
          toAccountId: p.toAccountId,
          amount: p.amount,
          dayOffset,
          category: p.category,
          timeframe: p.timeframe,
          label: p.label,
          origin: p.origin,
          referenceId: p.sourceId,
          categoryId: p.categoryId,
          resolution,
          resolvedFrom,
          meta: { tags: p.tags },
        });
      } else if (p.category === FlowCategory.INCOME) {
        flows.push({
          kind: 'INFLOW',
          accountId: p.toAccountId,
          amount: p.amount,
          dayOffset,
          category: p.category,
          timeframe: p.timeframe,
          label: p.label,
          origin: p.origin,
          referenceId: p.sourceId,
          categoryId: p.categoryId,
          meta: { tags: p.tags },
        });
      } else {
        flows.push({
          kind: 'OUTFLOW',
          accountId: p.fromAccountId,
          amount: p.amount,
          dayOffset,
          category: p.category,
          timeframe: p.timeframe,
          label: p.label,
          origin: p.origin,
          referenceId: p.sourceId,
          categoryId: p.categoryId,
          resolution,
          resolvedFrom,
          meta: { tags: p.tags },
        });
      }
    }

    flows.forEach(assertValidFlow);
    return flows;
  }

  /**
   * Enforces global, deterministic timeline ordering by dayOffset across all domains.
   */
  static sortTimeline(flows: Flow[]): Flow[] {
    return [...flows].sort((a, b) => a.dayOffset - b.dayOffset);
  }
}
