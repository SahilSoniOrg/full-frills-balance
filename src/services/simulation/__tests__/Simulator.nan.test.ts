import { Simulator } from '@/src/services/simulation/Simulator';
import { Flow, FlowCategory, FlowSource } from '@/src/services/simulation/types';
import { AccountId } from '@/src/types/ids';

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

describe('Simulator numeric input invariants', () => {
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
    expect(() => simulateWith({ days })).toThrow('[SimulationInputInvariant] days must be finite');
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
