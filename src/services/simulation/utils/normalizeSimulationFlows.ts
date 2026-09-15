import type { Flow } from '../types';
import { assertGlobalIntegrity } from './SimulationIntegrity';

/** Applies the canonical flow normalization shared by preview and production. */
export function normalizeSimulationFlows(flows: readonly Flow[]): Flow[] {
  const normalized = flows.map(flow => ({
    ...flow,
    amount: Math.round((flow.amount + Number.EPSILON) * 100) / 100,
  }));
  assertGlobalIntegrity(normalized);
  return normalized;
}
