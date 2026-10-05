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
    [1, 0, 'over', 'error', 'error'],
    [0.8, 0, 'nearLimit', 'warning', 'warning'],
    [0.79, 0.2, 'aheadOfPace', 'warning', 'warning'],
    [0.3, 0.2, 'onPace', 'primary', 'success'],
    [0.301, 0.2, 'aheadOfPace', 'warning', 'warning'],
    [0, 0, 'onPace', 'primary', 'success'],
    [0.7, 1, 'onPace', 'primary', 'success'],
    [0.85, 1, 'nearLimit', 'warning', 'warning'],
    [1.1, 1, 'over', 'error', 'error'],
    [0.4, 1, 'onPace', 'primary', 'success'],
  ])(
    'resolves %s spent at %s elapsed to %s',
    (spent, elapsed, expectedStatus, expectedColor, expectedVariant) => {
      const result = resolveBudgetStatus(spent, elapsed);
      expect(result.status).toBe(expectedStatus);
      expect(result.statusColor).toBe(expectedColor);
      expect(result.statusBadge.variant).toBe(expectedVariant);
    },
  );

  it('keeps missing FX above pace presentation', () => {
    expect(presentBudgetUsage(makeUsage({ hasUnvaluedEntries: true }), 0.1)).toMatchObject({
      status: 'aheadOfPace',
      statusColor: 'warning',
      statusBadge: { text: 'Incomplete' },
    });
  });
});

describe('presentBudgetUsage', () => {
  it('derives over-budget state from usage', () => {
    const vm = presentBudgetUsage(makeUsage({ remaining: -100, usagePercent: 1.2 }));

    expect(vm.isOver).toBe(true);
    expect(vm.statusBadge.variant).toBe('error');
  });
});
