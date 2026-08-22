import { FlowResolver } from './FlowResolver';
import { Flow } from './types';

export class ProjectionComposer {
  /**
   * Reconciles Budget Intent vs Planned Expense Obligations.
   * A budget flow reconciles against planned flows in any category covered
   * by that budget on the same day, emitting merged/deduplicated flows.
   */
  static composeSpending(
    budgetFlows: Flow[],
    plannedFlows: Flow[],
    budgetCategoryMap?: Map<string, Set<string>>,
  ): Flow[] {
    return FlowResolver.resolveConflicts([...budgetFlows, ...plannedFlows], budgetCategoryMap);
  }

  /**
   * Enforces global, deterministic timeline ordering by dayOffset across all domains.
   */
  static sortTimeline(flows: Flow[]): Flow[] {
    return [...flows].sort((a, b) => a.dayOffset - b.dayOffset);
  }
}
