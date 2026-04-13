import { Flow, FlowCategory, FlowSource } from '../types';

/**
 * Ensures that a Flow object adheres to business policy invariants.
 * These are "Soft" rules that may evolve as product requirements change.
 */
export function assertPolicyInvariants(
  flow: Flow,
  throwInvariant: (msg: string, f: Flow) => never,
): void {
  // 1. Source <=> Category Invariants
  if (flow.origin === FlowSource.BUDGET && flow.category !== FlowCategory.BUDGET) {
    throwInvariant(`BUDGET source must have BUDGET category. Found: ${flow.category}`, flow);
  }

  if (flow.origin === FlowSource.LIABILITY && flow.category !== FlowCategory.DEBT) {
    throwInvariant(`LIABILITY source must have DEBT category. Found: ${flow.category}`, flow);
  }

  if (flow.origin === FlowSource.PLANNED_PAYMENT) {
    const validPlanned = [
      FlowCategory.PLANNED_EXPENSE,
      FlowCategory.EXPENSE, // Added to support unified journal/template origin
      FlowCategory.DEBT,
      FlowCategory.INCOME,
      FlowCategory.TRANSFER,
    ];
    if (!validPlanned.includes(flow.category)) {
      throwInvariant(`PLANNED_PAYMENT source has invalid category: ${flow.category}`, flow);
    }
  }

  if (flow.origin === FlowSource.PLANNED_JOURNAL) {
    const validJournal = [
      FlowCategory.EXPENSE,
      FlowCategory.DEBT,
      FlowCategory.INCOME,
      FlowCategory.TRANSFER,
    ];
    if (!validJournal.includes(flow.category)) {
      throwInvariant(`PLANNED_JOURNAL source has invalid category: ${flow.category}`, flow);
    }
  }

  // 2. Resolution Metadata Invariants
  if (flow.resolvedFrom) {
    const validCategories = [
      FlowCategory.BUDGET,
      FlowCategory.PLANNED_EXPENSE,
      FlowCategory.EXPENSE,
    ];
    if (!validCategories.includes(flow.category)) {
      throwInvariant(
        `resolvedFrom '${flow.resolvedFrom}' is inconsistent with category '${flow.category}'`,
        flow,
      );
    }
  }
}
