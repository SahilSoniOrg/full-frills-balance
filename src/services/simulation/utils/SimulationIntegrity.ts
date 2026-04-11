import { Flow } from '../types';

/**
 * Validates cross-flow invariants for a complete simulation result.
 * These rules check for logical consistency across multiple flows (e.g., double-counting).
 */
export function assertGlobalIntegrity(flows: Flow[]): void {
  const seenIds = new Set<string>();

  for (const flow of flows) {
    // 1. Duplicate ID Check: Prevents double-counting logical events.
    // Every flow MUST have a referenceId (enforced by Type & Invariants).
    // We allow multiple flows for the same referenceId ONLY IF they are assigned
    // to different targets (e.g., split payment across accounts).

    let targetId = '';
    if (flow.kind === 'TRANSFER') {
      targetId = `${flow.fromAccountId}->${flow.toAccountId}`;
    } else {
      targetId = flow.accountId;
    }

    const uniqueKey = `${flow.category}-${flow.referenceId}-${flow.dayOffset}-${flow.kind}-${targetId}`;

    if (seenIds.has(uniqueKey)) {
      throw new Error(
        `[GlobalIntegrity] Double-counting detected for flow: ${flow.label}. \nDuplicate Key: ${uniqueKey}`,
      );
    }
    seenIds.add(uniqueKey);
  }
}
