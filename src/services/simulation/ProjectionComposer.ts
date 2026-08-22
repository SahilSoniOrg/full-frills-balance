import { BudgetFlowGenerator } from './engines/BudgetFlowGenerator';
import { FlowResolver } from './FlowResolver';
import { BudgetCapacityProjection, Flow, SimulationContext } from './types';

export class ProjectionComposer {
  /**
   * Reconciles Budget Intent vs Planned Expense Obligations via Delayed Discretization.
   * Consumes semantic budget capacity projections and scheduled planned flows,
   * resolves cycle-level capacities against matching planned outflows, materializes
   * residual daily budget burn flows, and reconciles day-level tags.
   */
  static composeSpending(
    budgetCapacities: BudgetCapacityProjection[],
    plannedFlows: Flow[],
    context: SimulationContext,
    budgetCategoryMap?: Map<string, Set<string>>,
  ): Flow[] {
    const { budgetFlows } = BudgetFlowGenerator.materializeFlows(
      context,
      budgetCapacities,
      plannedFlows,
    );

    const effectiveCategoryMap =
      budgetCategoryMap ||
      new Map<string, Set<string>>(budgetCapacities.map(b => [b.budgetId, b.accountScope]));

    return FlowResolver.resolveConflicts([...budgetFlows, ...plannedFlows], effectiveCategoryMap);
  }

  /**
   * Enforces global, deterministic timeline ordering by dayOffset across all domains.
   */
  static sortTimeline(flows: Flow[]): Flow[] {
    return [...flows].sort((a, b) => a.dayOffset - b.dayOffset);
  }
}
