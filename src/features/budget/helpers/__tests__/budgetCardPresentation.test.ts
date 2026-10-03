import { BudgetUsage } from '@/src/services/budget/types';
import {
  BudgetCardInput,
  presentBudgetListCard,
  presentBudgetUsage,
  resolveBudgetStatus,
} from '../budgetCardPresentation';

const monthlyBudget: BudgetCardInput = {
  name: 'Groceries',
  amount: 500,
  currencyCode: 'USD',
  intervalType: 'MONTHLY',
  intervalN: 1,
  recurrenceDay: 1,
};

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
  it('derives progress and over-budget state from usage', () => {
    const vm = presentBudgetUsage(makeUsage({ remaining: -100, usagePercent: 1.2 }));

    expect(vm.isOver).toBe(true);
    expect(vm.progress).toBe(100);
    expect(vm.statusBadge.variant).toBe('error');
  });
});

describe('presentBudgetListCard', () => {
  it('maps budget header fields without usage amounts', () => {
    const vm = presentBudgetListCard(monthlyBudget, makeUsage(), undefined);

    expect(vm.name).toBe('Groceries');
    expect(vm.amount).toBe(500);
    expect(vm.statusColor).toBe('primary');
    expect(vm.periodSubtitle.length).toBeGreaterThan(0);
    expect(vm.intervalLabel).toBe('Monthly');
    expect(vm.cadenceLabel).toBe('1 mo');
    expect(vm).not.toHaveProperty('spent');
    expect(vm).not.toHaveProperty('statusBadge');
  });

  it('identifies a multi-month budget limit', () => {
    const vm = presentBudgetListCard({ ...monthlyBudget, intervalN: 3 }, makeUsage(), undefined);
    expect(vm.intervalLabel).toBe('Every 3 months');
    expect(vm.cadenceLabel).toBe('3 mo');
  });

  it('shows the monthly cadence used by legacy budgets with a zero interval', () => {
    const vm = presentBudgetListCard({ ...monthlyBudget, intervalN: 0 }, makeUsage(), undefined);
    expect(vm.intervalLabel).toBe('Monthly');
    expect(vm.cadenceLabel).toBe('1 mo');
  });

  it('derives status color for over-budget usage', () => {
    const vm = presentBudgetListCard(
      monthlyBudget,
      makeUsage({ spent: 600, remaining: -100, usagePercent: 1.2 }),
      undefined,
    );

    expect(vm.statusColor).toBe('error');
  });

  it('includes previous period comparison when provided', () => {
    const vm = presentBudgetListCard(
      monthlyBudget,
      makeUsage(),
      makeUsage({ remaining: -50, usagePercent: 1.1 }),
    );

    expect(vm.previousPeriodLabel).toBeDefined();
  });
});
