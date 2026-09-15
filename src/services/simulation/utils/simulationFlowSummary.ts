import { Flow, FlowCategory } from '../types';
import { getLiquidImpact, isCommitmentFlow } from './FlowPolicy';

export interface SimulationFlowSummary {
  readonly totalFutureInflow: number;
  readonly totalPlannedOutflow: number;
  readonly totalCommittedPlanned: number;
}

/** Summarizes timeline flows without requiring account metadata or database models. */
export function summarizeSimulationFlows(
  flows: readonly Flow[],
  liquidAccountIds: ReadonlySet<string>,
): SimulationFlowSummary {
  let totalFutureInflow = 0;
  let totalPlannedOutflow = 0;
  let totalCommittedPlanned = 0;

  for (const flow of flows) {
    if (flow.timeframe !== 'FUTURE') continue;
    const impact = getLiquidImpact(flow, liquidAccountIds);
    if (impact.direction === 'NONE') continue;

    if (impact.direction === 'INFLOW' && flow.category === FlowCategory.INCOME) {
      totalFutureInflow += impact.amount;
    } else if (
      impact.direction === 'OUTFLOW' &&
      (flow.category === FlowCategory.PLANNED_EXPENSE || flow.category === FlowCategory.EXPENSE)
    ) {
      totalPlannedOutflow += impact.amount;
    }

    if (
      isCommitmentFlow(flow) &&
      (impact.direction === 'OUTFLOW' || impact.direction === 'INTERNAL')
    ) {
      totalCommittedPlanned += impact.amount;
    }
  }

  return {
    totalFutureInflow: round(totalFutureInflow),
    totalPlannedOutflow: round(totalPlannedOutflow),
    totalCommittedPlanned: round(totalCommittedPlanned),
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
