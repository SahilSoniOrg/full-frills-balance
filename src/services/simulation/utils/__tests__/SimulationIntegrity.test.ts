import { FlowCategory, FlowSource } from '../../types';
import { assertGlobalIntegrity } from '../SimulationIntegrity';

describe('SimulationIntegrity', () => {
  const baseFlow = {
    amount: 100,
    dayOffset: 10,
    category: FlowCategory.EXPENSE,
    timeframe: 'FUTURE' as const,
    label: 'Test Flow',
    origin: FlowSource.MANUAL,
    kind: 'OUTFLOW' as const,
    accountId: 'acc-1',
  };

  it('passes for unique flows', () => {
    const flows = [
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 1 },
      { ...baseFlow, referenceId: 'ref-2', dayOffset: 1 },
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 2 },
    ];
    expect(() => assertGlobalIntegrity(flows)).not.toThrow();
  });

  it('throws for double-counting (same ref, category, day)', () => {
    const flows = [
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 1, category: FlowCategory.BUDGET },
      {
        ...baseFlow,
        referenceId: 'ref-1',
        dayOffset: 1,
        category: FlowCategory.BUDGET,
        label: 'Duplicate',
      },
    ];
    expect(() => assertGlobalIntegrity(flows)).toThrow(
      '[GlobalIntegrity] Double-counting detected',
    );
  });

  it('passes for different categories with same ref/day', () => {
    // This could happen if a budget and an expense share a reference ID but are in different categories
    const flows = [
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 1, category: FlowCategory.BUDGET },
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 1, category: FlowCategory.EXPENSE },
    ];
    expect(() => assertGlobalIntegrity(flows)).not.toThrow();
  });

  it('passes for split flows (same ref/day, different accounts)', () => {
    const flows = [
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 1, accountId: 'acc-1' },
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 1, accountId: 'acc-2' },
    ];
    expect(() => assertGlobalIntegrity(flows)).not.toThrow();
  });

  it('throws for identical flows to the same account', () => {
    const flows = [
      { ...baseFlow, referenceId: 'ref-1', dayOffset: 1, accountId: 'acc-1' },
      {
        ...baseFlow,
        referenceId: 'ref-1',
        dayOffset: 1,
        accountId: 'acc-1',
        label: 'Double Count',
      },
    ];
    expect(() => assertGlobalIntegrity(flows)).toThrow(
      '[GlobalIntegrity] Double-counting detected',
    );
  });

  it('passes for transfers with same ref but different account pairs', () => {
    const tBase = {
      ...baseFlow,
      kind: 'TRANSFER' as const,
      category: FlowCategory.TRANSFER,
      referenceId: 'ref-trans',
    };
    const flows = [
      { ...tBase, fromAccountId: 'acc-1', toAccountId: 'acc-2' },
      { ...tBase, fromAccountId: 'acc-1', toAccountId: 'acc-3' },
    ];
    expect(() => assertGlobalIntegrity(flows)).not.toThrow();
  });
});
