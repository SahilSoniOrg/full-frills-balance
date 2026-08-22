import Account from '@/src/data/models/Account';
import { LiabilityFlowGenerator } from './engines/LiabilityFlowGenerator';
import { FlowResolver } from './FlowResolver';
import { Flow, LiabilityMetadata, SimulationContext } from './types';

export interface ComposeInput {
  plannedFlows: Flow[];
  budgetFlows: Flow[];
  budgetCategoryMap?: Map<string, Set<string>>;
  liabilityInput?: {
    liabilityBalances: { account: Account; balance: number }[];
    metadataMap: Map<string, LiabilityMetadata>;
    statementBalances: Map<string, number>;
    settledSinceStatement: Map<string, number>;
  };
  context: SimulationContext;
}

export class ProjectionComposer {
  /**
   * Central orchestrator for all cross-domain financial interactions:
   * 1. Reconciles Budget Intent vs Planned Expense Obligations.
   * 2. Routes CC spending charges into statement obligations & offsets by payment transfers.
   * 3. Ensures deterministic global timeline ordering by dayOffset.
   */
  static compose(input: ComposeInput): Flow[] {
    const { plannedFlows, budgetFlows, budgetCategoryMap, liabilityInput, context } = input;

    // 1. Cross-Domain Composition: Budget vs Planned Spend
    const resolvedSpendingFlows = FlowResolver.resolveConflicts(
      [...budgetFlows, ...plannedFlows],
      budgetCategoryMap,
    );

    // 2. Cross-Domain Composition: Liability Statement Accumulation & Transfer Offsets
    let liabilityFlows: Flow[] = [];
    if (liabilityInput) {
      liabilityFlows = LiabilityFlowGenerator.generate(
        context,
        resolvedSpendingFlows,
        liabilityInput.liabilityBalances,
        liabilityInput.metadataMap,
        liabilityInput.statementBalances,
        liabilityInput.settledSinceStatement,
      );
    }

    // 3. Global Timeline Sorting
    return [...resolvedSpendingFlows, ...liabilityFlows].sort((a, b) => a.dayOffset - b.dayOffset);
  }
}
