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

function outflow(accountId: string, overrides: { amount?: number; dayOffset?: number } = {}): Flow {
  return {
    amount: overrides.amount ?? 100,
    dayOffset: overrides.dayOffset ?? 0,
    category: FlowCategory.PLANNED_EXPENSE,
    timeframe: 'FUTURE',
    label: 'test-flow',
    origin: FlowSource.PLANNED_PAYMENT,
    referenceId: 'f1',
    kind: 'OUTFLOW',
    accountId: accountId as AccountId,
  };
}

function simulateWith({
  startingBalances = new Map([['a', 100]]),
  flows = [],
  days = 1,
  startDayOffset = 0,
  startDayTimestamp = 1_700_000_000_000,
}: {
  startingBalances?: Map<string, number>;
  flows?: Flow[];
  days?: number;
  startDayOffset?: number;
  startDayTimestamp?: number;
} = {}) {
  return Simulator.simulate(
    startingBalances,
    flows,
    days,
    new Set(['a']),
    [],
    startDayOffset,
    startDayTimestamp,
  );
}

describe('Simulator edge cases', () => {
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

  describe('numeric input invariants', () => {
    it('rounds projection outputs using result currency precision', () => {
      const startingBalances = new Map([['a', 1.001]]);
      const precise = Simulator.simulate(
        startingBalances,
        [],
        1,
        new Set(['a']),
        [],
        0,
        1_700_000_000_000,
        undefined,
        3,
      );
      const wholeUnit = Simulator.simulate(
        new Map([['a', 1.6]]),
        [],
        1,
        new Set(['a']),
        [],
        0,
        1_700_000_000_000,
        undefined,
        0,
      );

      expect(precise.summary.safeToSpend).toBe(1.001);
      expect(precise.projections[0]?.globalBalance).toBe(1.001);
      expect(precise.projections[0]?.accountBalances.get('a')).toBe(1.001);
      expect(wholeUnit.summary.safeToSpend).toBe(2);
      expect(wholeUnit.projections[0]?.globalBalance).toBe(2);
    });

    it.each([NaN, Infinity, -Infinity])('rejects non-finite starting balance %s', balance => {
      expect(() => simulateWith({ startingBalances: new Map([['a', balance]]) })).toThrow(
        '[SimulationInputInvariant] starting balance for a must be finite',
      );
    });

    it.each([NaN, Infinity, -Infinity])('rejects non-finite flow amount %s', amount => {
      expect(() => simulateWith({ flows: [outflow('a', { amount })] })).toThrow(
        '[FlowInvariant] Non-finite amount found',
      );
    });

    it.each([NaN, Infinity, -Infinity])('rejects non-finite flow dayOffset %s', dayOffset => {
      expect(() => simulateWith({ flows: [outflow('a', { dayOffset })] })).toThrow(
        '[FlowInvariant] Non-finite dayOffset found',
      );
    });

    it('rejects fractional flow day offsets', () => {
      expect(() => simulateWith({ flows: [outflow('a', { dayOffset: 1.5 })] })).toThrow(
        '[FlowInvariant] Non-integer dayOffset found: 1.5',
      );
    });

    it.each([NaN, Infinity, -Infinity])('rejects non-finite simulation days %s', days => {
      expect(() => simulateWith({ days })).toThrow(
        '[SimulationInputInvariant] days must be finite',
      );
    });

    it('rejects fractional simulation days', () => {
      expect(() => simulateWith({ days: 1.5 })).toThrow(
        '[SimulationInputInvariant] days must be an integer; received 1.5',
      );
    });

    it('rejects negative simulation days', () => {
      expect(() => simulateWith({ days: -1 })).toThrow(
        '[SimulationInputInvariant] days must be non-negative; received -1',
      );
    });

    it.each([NaN, Infinity, -Infinity])(
      'rejects non-finite simulation start offsets %s',
      startDayOffset => {
        expect(() => simulateWith({ startDayOffset })).toThrow(
          '[SimulationInputInvariant] startDayOffset must be finite',
        );
      },
    );

    it('rejects fractional simulation start offsets', () => {
      expect(() => simulateWith({ startDayOffset: 1.5 })).toThrow(
        '[SimulationInputInvariant] startDayOffset must be an integer; received 1.5',
      );
    });

    it.each([NaN, Infinity, -Infinity])(
      'rejects non-finite start timestamps %s',
      startDayTimestamp => {
        expect(() => simulateWith({ startDayTimestamp })).toThrow(
          '[SimulationInputInvariant] startDayTimestamp must be finite',
        );
      },
    );

    it('allows negative starting balances', () => {
      const result = simulateWith({ startingBalances: new Map([['a', -100]]) });

      expect(result.summary.safeToSpend).toBe(0);
      expect(result.projections[0].globalBalance).toBe(-100);
      expect(Number.isFinite(result.projections[0].globalBalance)).toBe(true);
    });

    it('preserves valid projection behavior', () => {
      const result = simulateWith({ flows: [outflow('a', { amount: 25 })] });

      expect(result.summary.safeToSpend).toBe(75);
      expect(result.projections[0].globalBalance).toBe(75);
      expect(result.projections[0].accountBalances.get('a')).toBe(75);
    });
  });
});
