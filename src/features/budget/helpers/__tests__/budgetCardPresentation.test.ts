import { BudgetUsage } from '@/src/services/budget/types';
import { presentBudgetUsage, resolveBudgetStatus } from '../budgetCardPresentation';

function makeUsage(overrides: Partial<BudgetUsage> = {}): BudgetUsage {
  return {
    spent: 200,
    remaining: 300,
    budgetAmount: 500,
    usagePercent: 0.4,
    ...overrides,
  };
}

describe('resolveBudgetStatus', () => {
  it.each([
    [1, 0, 'over'],
    [0.8, 0, 'nearLimit'],
    [0.79, 0.2, 'aheadOfPace'],
    [0.3, 0.2, 'onPace'],
    [0.301, 0.2, 'aheadOfPace'],
    [0, 0, 'onPace'],
    [0.7, 1, 'onPace'],
    [0.85, 1, 'nearLimit'],
    [1.1, 1, 'over'],
  ])('resolves %s spent at %s elapsed to %s', (spent, elapsed, expected) => {
    expect(resolveBudgetStatus(spent, elapsed).status).toBe(expected);
  });

  it('keeps missing FX above pace presentation', () => {
    expect(presentBudgetUsage(makeUsage({ hasUnvaluedEntries: true }), 0.1)).toMatchObject({
      status: 'aheadOfPace',
      statusColor: 'warning',
      statusBadge: { text: 'Incomplete' },
    });
  });

  it('returns on track below 80%', () => {
    expect(resolveBudgetStatus(0.4).statusColor).toBe('primary');
    expect(resolveBudgetStatus(0.4).statusBadge.variant).toBe('success');
  });

  it('returns warning between 80% and 100%', () => {
    expect(resolveBudgetStatus(0.85).statusColor).toBe('warning');
    expect(resolveBudgetStatus(0.85).statusBadge.variant).toBe('warning');
  });

  it('returns error at or above 100%', () => {
    expect(resolveBudgetStatus(1).statusColor).toBe('error');
    expect(resolveBudgetStatus(1).statusBadge.variant).toBe('error');
  });
});

describe('presentBudgetUsage', () => {
  it('derives over-budget state from usage', () => {
    const vm = presentBudgetUsage(makeUsage({ remaining: -100, usagePercent: 1.2 }));

    expect(vm.isOver).toBe(true);
    expect(vm.statusBadge.variant).toBe('error');
  });
});
