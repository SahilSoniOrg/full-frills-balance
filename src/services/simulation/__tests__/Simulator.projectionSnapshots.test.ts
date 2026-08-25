import { Simulator } from '@/src/services/simulation/Simulator';
import { FlowCategory, FlowSource } from '@/src/services/simulation/types';
import { AccountId } from '@/src/types/ids';

describe('Simulator projection snapshots', () => {
  it('keeps quiet days stable while isolating later balance changes', () => {
    const result = Simulator.simulate(
      new Map([['cash', 100]]),
      [
        {
          accountId: 'cash' as AccountId,
          amount: 10,
          dayOffset: 2,
          category: FlowCategory.PLANNED_EXPENSE,
          timeframe: 'FUTURE',
          label: 'expense',
          origin: FlowSource.PLANNED_PAYMENT,
          referenceId: 'flow-1',
          kind: 'OUTFLOW',
        },
      ],
      4,
      new Set(['cash']),
    );

    expect(result.projections[0].accountBalances).toBe(result.projections[1].accountBalances);
    expect(result.projections[1].accountBalances).not.toBe(result.projections[2].accountBalances);
    expect(result.projections[0].accountBalances.get('cash')).toBe(100);
    expect(result.projections[2].accountBalances.get('cash')).toBe(90);
    expect(result.projections[3].accountBalances).toBe(result.projections[2].accountBalances);
  });
});
