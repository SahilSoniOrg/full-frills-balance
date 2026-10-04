import type { Flow } from '../types';

/** Clones flows while retaining fractional allocations until totals are materialized. */
export function normalizeSimulationFlows(flows: readonly Flow[]): Flow[] {
  return flows.map(flow => ({ ...flow }));
}
