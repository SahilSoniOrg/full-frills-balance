import { Simulator } from '../Simulator';
import { Flow } from '../types';

describe('Simulator NaN Propagation', () => {
  it('should propagate NaN from initial balances', () => {
    const startingBalances = new Map([['a', NaN]]);
    const liquidAccountIds = new Set(['a']);
    const result = Simulator.simulate(startingBalances, [], 1, liquidAccountIds);
    expect(result.summary.safeToSpend).toBeNaN();
  });

  it('should propagate NaN from flow amounts', () => {
    const startingBalances = new Map([['a', 100]]);
    const liquidAccountIds = new Set(['a']);
    const flows: Flow[] = [
      {
        id: 'f1',
        dayOffset: 0,
        amount: NaN,
        kind: 'OUTFLOW',
        accountId: 'a',
      } as any,
    ];
    const result = Simulator.simulate(startingBalances, flows, 1, liquidAccountIds);
    expect(result.summary.safeToSpend).toBeNaN();
  });

  it('should maintain Map consistency even if NaN occurs', () => {
    const startingBalances = new Map([['a', 100]]);
    const liquidAccountIds = new Set(['a']);
    const flows: Flow[] = [
      {
        id: 'f1',
        dayOffset: 0,
        amount: NaN,
        kind: 'OUTFLOW',
        accountId: 'a',
      } as any,
    ];
    const result = Simulator.simulate(startingBalances, flows, 1, liquidAccountIds);

    // globalBalance should be NaN
    expect(result.projections[0].globalBalance).toBeNaN();

    // Account balance in map should also be NaN
    const accountBalance = result.projections[0].accountBalances.get('a');
    expect(accountBalance).toBeNaN();
  });
});
