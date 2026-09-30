import type { Flow } from '../types';
import { assertGlobalIntegrity } from './SimulationIntegrity';

/** Clones and validates flows while retaining fractional allocations until totals are materialized. */
export function normalizeSimulationFlows(flows: readonly Flow[]): Flow[] {
  const normalized = flows.map(flow => ({ ...flow }));
  assertGlobalIntegrity(normalized);
  return normalized;
}
