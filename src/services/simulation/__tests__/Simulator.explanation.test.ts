import { Simulator } from '@/src/services/simulation/Simulator';
import { FlowCategory, FlowSource, type Flow } from '@/src/services/simulation/types';
import { AccountId } from '@/src/types/ids';

function flow(
  kind: 'INFLOW' | 'OUTFLOW',
  accountId: string,
  amount: number,
  dayOffset: number,
  label: string,
): Flow {
  return {
    kind,
    accountId: accountId as AccountId,
    amount,
    dayOffset,
    category: kind === 'INFLOW' ? FlowCategory.INCOME : FlowCategory.PLANNED_EXPENSE,
    timeframe: 'FUTURE',
    label,
    origin: FlowSource.PLANNED_PAYMENT,
    referenceId: label,
  };
}

describe('dated Safe-to-Spend explanation', () => {
  it('explains the liquid low point and excludes flows that did not affect the headline', () => {
    const result = Simulator.simulate(
      new Map([
        ['cash', 1000],
        ['investment', 5000],
      ]),
      [
        flow('OUTFLOW', 'cash', 800, 5, 'Rent'),
        flow('INFLOW', 'cash', 1500, 20, 'Salary'),
        flow('INFLOW', 'investment', 9000, 8, 'Investment return'),
        flow('OUTFLOW', 'cash', 700, 40, 'Outside horizon'),
        flow('OUTFLOW', 'cash', 50, 1, 'Before window'),
      ],
      30,
      new Set(['cash']),
      [],
      2,
      new Date(2026, 8, 30).getTime(),
      undefined,
      2,
    );

    expect(result.summary.safeToSpend).toBe(200);
    expect(result.safeToSpendExplanation).toMatchObject({
      cashCeiling: 1000,
      minimumDatedBalance: 200,
      bindingDayOffset: 5,
      heldAmount: 800,
      horizonDays: 30,
    });
    expect(result.safeToSpendExplanation.constrainingOutflows.map(item => item.label)).toEqual([
      'Rent',
    ]);
    expect(result.safeToSpendExplanation.assumedInflows.map(item => item.label)).toEqual([
      'Salary',
    ]);
  });

  it('uses cash as the binding ceiling when dated balances never fall below it', () => {
    const result = Simulator.simulate(new Map([['cash', 1000]]), [], 10, new Set(['cash']));
    expect(result.safeToSpendExplanation.bindingDayOffset).toBeNull();
    expect(result.safeToSpendExplanation.heldAmount).toBe(0);
  });

  it('keeps shortfall and explanation values at the result currency precision', () => {
    const result = Simulator.simulate(
      new Map([['cash', 1.234]]),
      [flow('OUTFLOW', 'cash', 2, 1, 'Bill')],
      3,
      new Set(['cash']),
      [],
      0,
      new Date(2026, 8, 30).getTime(),
      undefined,
      3,
    );
    expect(result.summary.safeToSpend).toBe(0);
    expect(result.summary.shortfall).toBe(0.766);
    expect(result.safeToSpendExplanation).toMatchObject({
      cashCeiling: 1.234,
      minimumDatedBalance: -0.766,
      heldAmount: 1.234,
      shortfall: 0.766,
    });
  });
});
