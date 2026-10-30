import { runBalanceSimulation, type BalanceSimulationInput } from './balanceSimulation';
import { throwIfSimulationAborted } from './simulationCancellation';
import type { SimulationEngineResult } from './types';

/** Web has no Worker Runtime; use exactly the same financial algorithm locally. */
export async function executeBalanceSimulation(
  input: BalanceSimulationInput,
  signal?: AbortSignal,
): Promise<SimulationEngineResult> {
  throwIfSimulationAborted(signal);
  return runBalanceSimulation(input);
}
