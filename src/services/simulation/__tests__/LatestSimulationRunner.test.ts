import { LatestSimulationRunner } from '../LatestSimulationRunner';
import { runBalanceSimulation, type BalanceSimulationInput } from '../balanceSimulation';
import type { SimulationEngineResult } from '../types';

function input(balance: number): BalanceSimulationInput {
  return {
    startingBalances: new Map([['cash', balance]]),
    flows: [],
    days: 2,
    liquidAccountIds: new Set(['cash']),
    orderedLiquidAccountIds: ['cash'],
    startDayOffset: 0,
    startDayTimestamp: 1_700_000_000_000,
    precision: 2,
    majorInflowThreshold: 200,
    financialEpsilon: 0.01,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('LatestSimulationRunner', () => {
  it('retains the running calculation and only the newest pending input', async () => {
    const first = deferred<SimulationEngineResult>();
    const execute = jest.fn(async (snapshot: BalanceSimulationInput) =>
      runBalanceSimulation(snapshot),
    );
    execute.mockImplementationOnce(() => first.promise);
    const runner = new LatestSimulationRunner(execute);
    const active = runner.run(input(100));
    const superseded = runner.run(input(200));
    const rejected = expect(superseded).rejects.toMatchObject({ name: 'AbortError' });
    const latest = runner.run(input(300));
    expect(execute).toHaveBeenCalledTimes(1);
    first.resolve(runBalanceSimulation(input(100)));
    expect((await active).summary.safeToSpend).toBe(100);
    await rejected;
    expect((await latest).summary.safeToSpend).toBe(300);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('rejects an aborted caller immediately without releasing a still-busy worker', async () => {
    const first = deferred<SimulationEngineResult>();
    const execute = jest.fn(async (snapshot: BalanceSimulationInput) =>
      runBalanceSimulation(snapshot),
    );
    execute.mockImplementationOnce(() => first.promise);
    const runner = new LatestSimulationRunner(execute);
    const controller = new AbortController();
    const active = runner.run(input(100), controller.signal);
    const rejected = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    const latest = runner.run(input(300));
    expect(execute).toHaveBeenCalledTimes(1);
    first.resolve(runBalanceSimulation(input(100)));
    expect((await latest).summary.safeToSpend).toBe(300);
  });

  it('removes aborted pending work and continues after a worker failure', async () => {
    const first = deferred<SimulationEngineResult>();
    const execute = jest.fn(async (snapshot: BalanceSimulationInput) =>
      runBalanceSimulation(snapshot),
    );
    execute.mockImplementationOnce(() => first.promise);
    const runner = new LatestSimulationRunner(execute);
    const active = runner.run(input(100));
    const failed = expect(active).rejects.toThrow('invalid financial input');
    const controller = new AbortController();
    const pending = runner.run(input(200), controller.signal);
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    first.reject(new Error('invalid financial input'));
    await failed;
    await cancelled;
    const result = await runner.run(input(300));
    expect(result.summary.safeToSpend).toBe(300);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch an already cancelled request', () => {
    const execute = jest.fn();
    const controller = new AbortController();
    controller.abort();
    expect(() => new LatestSimulationRunner(execute).run(input(100), controller.signal)).toThrow(
      'Simulation superseded or cancelled',
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
