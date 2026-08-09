import { Simulator } from '@/src/services/simulation/Simulator';
import { Flow, FlowCategory, FlowSource } from '@/src/services/simulation/types';
import { AccountId } from '@/src/types/domain';

function nanOutflow(accountId: string): Flow {
  return {
    amount: NaN,
    dayOffset: 0,
    category: FlowCategory.PLANNED_EXPENSE,
    timeframe: 'FUTURE',
    label: 'nan-flow',
    origin: FlowSource.PLANNED_PAYMENT,
    referenceId: 'f1',
    kind: 'OUTFLOW',
    accountId: accountId as AccountId,
  };
}

describe('Simulator NaN propagation', () => {
  it('propagates NaN from initial balances', () => {
    const startingBalances = new Map([['a', NaN]]);
    const liquidAccountIds = new Set(['a']);
    const result = Simulator.simulate(startingBalances, [], 1, liquidAccountIds);
    expect(result.summary.safeToSpend).toBeNaN();
  });

  it('propagates NaN from flow amounts', () => {
    const startingBalances = new Map([['a', 100]]);
    const liquidAccountIds = new Set(['a']);
    const result = Simulator.simulate(startingBalances, [nanOutflow('a')], 1, liquidAccountIds);
    expect(result.summary.safeToSpend).toBeNaN();
  });

  it('keeps Map balances consistent when NaN occurs', () => {
    const startingBalances = new Map([['a', 100]]);
    const liquidAccountIds = new Set(['a']);
    const result = Simulator.simulate(startingBalances, [nanOutflow('a')], 1, liquidAccountIds);

    expect(result.projections[0].globalBalance).toBeNaN();
    expect(result.projections[0].accountBalances.get('a')).toBeNaN();
  });
});
