import { createWorkletRuntime, runOnRuntimeAsync } from 'react-native-worklets';
import { executeBalanceSimulation } from '../simulationExecutor.native';
import { runBalanceSimulation, type BalanceSimulationInput } from '../balanceSimulation';

const input: BalanceSimulationInput = {
  startingBalances: new Map([['cash', 100]]),
  flows: [],
  days: 3,
  liquidAccountIds: new Set(['cash']),
  orderedLiquidAccountIds: ['cash'],
  startDayOffset: 0,
  startDayTimestamp: 1_700_000_000_000,
  precision: 2,
  majorInflowThreshold: 200,
  financialEpsilon: 0.01,
};

// Import the explicit base file through requireActual so Metro/Jest's native
// suffix resolution does not turn the web check into another worker check.
const local = jest.requireActual<{
  executeBalanceSimulation: typeof executeBalanceSimulation;
}>('../simulationExecutor.ts');

describe('simulation runtime dispatch', () => {
  const priorMode = process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION;
  afterEach(() => {
    if (priorMode === undefined) delete process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION;
    else process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION = priorMode;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('lazily creates and reuses one worker, preserving the local financial result', async () => {
    process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION = '1';
    const expected = runBalanceSimulation(input);
    expect(createWorkletRuntime).not.toHaveBeenCalled();
    expect(await executeBalanceSimulation(input)).toEqual(expected);
    expect(await executeBalanceSimulation(input)).toEqual(expected);
    expect(createWorkletRuntime).toHaveBeenCalledTimes(1);
    expect(runOnRuntimeAsync).toHaveBeenCalledTimes(2);
    expect(createWorkletRuntime).toHaveBeenCalledWith({
      name: 'finance-simulation',
      enableNetworking: false,
    });
  });

  it('allows local execution for comparison and keeps web independent of Worklets', async () => {
    process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION = '0';
    expect(await executeBalanceSimulation(input)).toEqual(
      await local.executeBalanceSimulation(input),
    );
    expect(runOnRuntimeAsync).not.toHaveBeenCalled();
  });

  it('keeps production on the local algorithm until explicitly enabled', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(global, '__DEV__');
    Object.defineProperty(global, '__DEV__', { value: false, configurable: true });
    try {
      delete process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION;
      expect(await executeBalanceSimulation(input)).toEqual(runBalanceSimulation(input));
      expect(runOnRuntimeAsync).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(global, '__DEV__', descriptor);
    }
  });

  it('propagates worker errors without retrying the financial calculation locally', async () => {
    process.env.EXPO_PUBLIC_BACKGROUND_SIMULATION = '1';
    (runOnRuntimeAsync as jest.Mock).mockRejectedValueOnce(new Error('worker failed'));
    await expect(executeBalanceSimulation(input)).rejects.toThrow('worker failed');
    expect(runOnRuntimeAsync).toHaveBeenCalledTimes(1);
  });
});
