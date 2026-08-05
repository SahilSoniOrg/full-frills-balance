import { BudgetUsage } from '@/src/services/budget/budgetReadService';
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
    expect(vm).not.toHaveProperty('spent');
    expect(vm).not.toHaveProperty('statusBadge');
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
    expect(vm.previousPeriodColor).toBe('error');
    expect(vm.previousPeriodIcon).toBe('trendingDown');
  });
});
