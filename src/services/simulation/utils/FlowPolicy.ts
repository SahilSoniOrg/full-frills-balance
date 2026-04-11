import { Flow, FlowCategory, FlowSource } from '../types';

/**
 * Centrally defines what constitutes a 'committed' flow.
 * Rules must be consistent across Summary reporting and UI selection.
 */
export function isCommitmentFlow(flow: Flow): boolean {
  // 1. Budget Burns are always commitments (if they represent an outflow)
  if (flow.category === FlowCategory.BUDGET) {
    return flow.kind === 'OUTFLOW';
  }

  // 2. Specific expenses (planned or regular) are commitments
  if (flow.category === FlowCategory.PLANNED_EXPENSE || flow.category === FlowCategory.EXPENSE) {
    return flow.kind === 'OUTFLOW' || flow.kind === 'TRANSFER';
  }

  // 3. Planned internal moves (towards a goal or category) can be commitments
  // Refining TRANSFER semantics: Only treat as commitment if it has a planned/automated origin.
  // Manual rebalancing (checking -> savings) should NOT be counted as a commitment.
  if (flow.category === FlowCategory.TRANSFER) {
    return flow.kind === 'TRANSFER' && flow.origin !== FlowSource.MANUAL;
  }

  return false;
}

/**
 * Resolves the liquid balance impact of a flow (The 'Flow System Effect' model).
 *
 * This model defines how a specific event affects the total liquidity of the system:
 * - INFLOW/OUTFLOW: Direct pressure on system boundaries.
 * - INTERNAL: A net-zero system shift (no change to total liquidity).
 * - NONE: The flow does not interact with the liquid system.
 */
export type LiquidImpact = {
  isLiquid: boolean;
  direction: 'INFLOW' | 'OUTFLOW' | 'INTERNAL' | 'NONE';
  amount: number;
};

export function getLiquidImpact(flow: Flow, liquidAccountIds: Set<string>): LiquidImpact {
  if (flow.kind === 'INFLOW') {
    const isLiquid = liquidAccountIds.has(flow.accountId);
    return {
      isLiquid,
      direction: isLiquid ? 'INFLOW' : 'NONE',
      amount: flow.amount,
    };
  }

  if (flow.kind === 'OUTFLOW') {
    const isLiquid = liquidAccountIds.has(flow.accountId);
    return {
      isLiquid,
      direction: isLiquid ? 'OUTFLOW' : 'NONE',
      amount: flow.amount,
    };
  }

  if (flow.kind === 'TRANSFER') {
    const fromLiquid = liquidAccountIds.has(flow.fromAccountId);
    const toLiquid = liquidAccountIds.has(flow.toAccountId);

    if (fromLiquid && toLiquid) {
      return { isLiquid: true, direction: 'INTERNAL', amount: flow.amount };
    }
    if (fromLiquid) {
      return { isLiquid: true, direction: 'OUTFLOW', amount: flow.amount };
    }
    if (toLiquid) {
      return { isLiquid: true, direction: 'INFLOW', amount: flow.amount };
    }
  }

  return { isLiquid: false, direction: 'NONE', amount: 0 };
}

/**
 * Centrally identifies the first 'major' income event in a simulation.
 * A major income event is defined as a FUTURE INFLOW of category INCOME
 * that meets the configured threshold.
 */
export function findFirstMajorInflowDay(
  flows: Flow[],
  liquidAccountIdsSet: Set<string>,
  threshold: number,
): number | null {
  const firstMajorInflow = flows.find(f => {
    if (f.timeframe !== 'FUTURE' || f.category !== FlowCategory.INCOME) return false;

    const impact = getLiquidImpact(f, liquidAccountIdsSet);
    return impact.direction === 'INFLOW' && impact.amount >= threshold;
  });

  return firstMajorInflow ? firstMajorInflow.dayOffset : null;
}
