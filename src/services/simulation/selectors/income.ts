import { Flow, IncomeEntry } from '../types';

/**
 * Extracts income-related entries from a list of flows.
 * This is a pure selector focusing on future income projections.
 */
export const selectIncomeEntries = (allFlows: Flow[]): IncomeEntry[] => {
  return allFlows
    .filter(flow => flow.timeframe === 'FUTURE' && flow.kind === 'INFLOW')
    .map(flow => ({
      id: flow.referenceId || `${flow.dayOffset}-income`,
      name: flow.label,
      amount: flow.amount,
      dayOffset: flow.dayOffset,
      type: flow.origin,
    }));
};
