import { createWorkletRuntime, runOnRuntimeAsync } from 'react-native-worklets';
import { logger } from '@/src/utils/logger';
import { runBalanceSimulation, type BalanceSimulationInput } from './balanceSimulation';
import { LatestSimulationRunner } from './LatestSimulationRunner';
import { throwIfSimulationAborted } from './simulationCancellation';

let runtime: ReturnType<typeof createWorkletRuntime> | undefined;

const runner = new LatestSimulationRunner(async input => {
  const startedAt = performance.now();
  if (!runtime) {
    const runtimeStartedAt = performance.now();
    runtime = createWorkletRuntime({ name: 'finance-simulation', enableNetworking: false });
    logger.metric('Simulation.WorkerInit', performance.now() - runtimeStartedAt);
  }
  const { result, computeMs } = await runOnRuntimeAsync(
    runtime,
    (snapshot: BalanceSimulationInput) => {
      'worklet';
      const computeStartedAt = performance.now();
      const result = runBalanceSimulation(snapshot);
      return { result, computeMs: performance.now() - computeStartedAt };
    },
    input,
  );
  // Timings only: never log balances, flows or account identifiers.
  logger.metric('Simulation.WorkerCompute', computeMs);
  logger.metric('Simulation.WorkerRoundTrip', performance.now() - startedAt);
  return result;
});

/** Native dashboard projection. Errors propagate; financial failures are never retried locally. */
export async function executeBalanceSimulation(
  input: BalanceSimulationInput,
  signal?: AbortSignal,
) {
  throwIfSimulationAborted(signal);
  // Production stays local until a release-device comparison validates the
  // native runtime and transfer overhead. 0 also provides a development A/B switch.
  const mode = process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION;
  if (mode === '0' || (!__DEV__ && mode !== '1')) {
    const startedAt = performance.now();
    const result = runBalanceSimulation(input);
    logger.metric('Simulation.LocalCompute', performance.now() - startedAt);
    return result;
  }
  return runner.run(input, signal);
}
