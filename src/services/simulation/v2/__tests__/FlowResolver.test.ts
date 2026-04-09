import { FlowResolver } from '@/src/services/simulation/v2/FlowResolver';
import { Flow } from '@/src/services/simulation/v2/types';

describe('FlowResolver', () => {
  it('reconciles a budget against planned spend in any covered category', () => {
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 100,
        dayOffset: 2,
        meta: {
          source: 'BUDGET',
          label: 'Food Budget',
          referenceId: 'budget-food',
          categoryId: 'exp-groceries',
          categoryIds: ['exp-groceries', 'exp-dining'],
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 80,
        dayOffset: 2,
        meta: {
          source: 'PLANNED',
          label: 'Dinner',
          referenceId: 'pp-dinner',
          categoryId: 'exp-dining',
        },
      },
    ];

    const resolved = FlowResolver.resolveConflicts(flows);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual(
      expect.objectContaining({
        kind: 'OUTFLOW',
        amount: 100,
        dayOffset: 2,
        meta: expect.objectContaining({
          source: 'RESOLVED',
          originalSource: 'BUDGET',
        }),
      }),
    );
  });

  it('uses the combined planned spend across all covered categories on the same day', () => {
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 100,
        dayOffset: 5,
        meta: {
          source: 'BUDGET',
          label: 'Food Budget',
          referenceId: 'budget-food',
          categoryId: 'exp-groceries',
          categoryIds: ['exp-groceries', 'exp-dining'],
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 40,
        dayOffset: 5,
        meta: {
          source: 'PLANNED',
          label: 'Groceries run',
          referenceId: 'pp-groceries',
          categoryId: 'exp-groceries',
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 80,
        dayOffset: 5,
        meta: {
          source: 'PLANNED',
          label: 'Dinner',
          referenceId: 'pp-dinner',
          categoryId: 'exp-dining',
        },
      },
    ];

    const resolved = FlowResolver.resolveConflicts(flows);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual(
      expect.objectContaining({
        amount: 120,
        meta: expect.objectContaining({
          source: 'RESOLVED',
          originalSource: 'PLANNED',
        }),
      }),
    );
  });

  it('leaves planned spend untouched when it falls outside the budget scope', () => {
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 100,
        dayOffset: 3,
        meta: {
          source: 'BUDGET',
          label: 'Food Budget',
          referenceId: 'budget-food',
          categoryId: 'exp-groceries',
          categoryIds: ['exp-groceries', 'exp-dining'],
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 90,
        dayOffset: 3,
        meta: {
          source: 'PLANNED',
          label: 'Gas',
          referenceId: 'pp-gas',
          categoryId: 'exp-transport',
        },
      },
    ];

    const resolved = FlowResolver.resolveConflicts(flows);

    expect(resolved).toHaveLength(2);
    expect(resolved.filter(flow => flow.meta?.source === 'BUDGET')).toHaveLength(1);
    expect(resolved.filter(flow => flow.meta?.source === 'PLANNED')).toHaveLength(1);
  });

  it('reconciles a budget split across multiple accounts against planned spend', () => {
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 50,
        dayOffset: 4,
        meta: {
          source: 'BUDGET',
          label: 'Shared Budget',
          referenceId: 'budget-shared',
          categoryIds: ['exp-groceries'],
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'savings',
        amount: 50,
        dayOffset: 4,
        meta: {
          source: 'BUDGET',
          label: 'Shared Budget',
          referenceId: 'budget-shared',
          categoryIds: ['exp-groceries'],
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 120,
        dayOffset: 4,
        meta: {
          source: 'PLANNED',
          label: 'Large Grocery Run',
          categoryId: 'exp-groceries',
        },
      },
    ];

    const resolved = FlowResolver.resolveConflicts(flows);

    // Should result in 1 resolved flow of 120 (since 120 > 50+50)
    expect(resolved).toHaveLength(1);
    expect(resolved[0].amount).toBe(120);
    expect(resolved[0].meta?.source).toBe('RESOLVED');
  });

  it('handles multiple budgets with overlapping categories correctly', () => {
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 100,
        dayOffset: 6,
        meta: {
          source: 'BUDGET',
          label: 'Food Budget',
          referenceId: 'budget-food',
          categoryIds: ['exp-groceries', 'exp-dining'],
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 50,
        dayOffset: 6,
        meta: {
          source: 'BUDGET',
          label: 'Groceries Only Budget',
          referenceId: 'budget-groceries',
          categoryIds: ['exp-groceries'],
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 80,
        dayOffset: 6,
        meta: {
          source: 'PLANNED',
          label: 'Weekly Groceries',
          categoryId: 'exp-groceries',
        },
      },
    ];

    const resolved = FlowResolver.resolveConflicts(flows);

    // Current implementation logic:
    // 1. Process 'budget-food' first. It matches 'Weekly Groceries' (80).
    //    100 (budget) vs 80 (planned) -> Resolved to 100.
    // 2. Process 'budget-groceries'. 'Weekly Groceries' is already matched.
    //    50 (budget) vs 0 (planned) -> Remains as 50.
    // Result: 1 Resolved (100) + 1 Budget (50) = 150 total.

    expect(resolved).toHaveLength(2);
    expect(resolved.find(f => f.meta?.referenceId === 'budget-food')?.meta?.source).toBe(
      'RESOLVED',
    );
    expect(resolved.find(f => f.meta?.referenceId === 'budget-groceries')?.meta?.source).toBe(
      'BUDGET',
    );
  });

  it('reconciles a planned transfer against a budget when the target category matches', () => {
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 100,
        dayOffset: 7,
        meta: {
          source: 'BUDGET',
          label: 'Savings Budget',
          referenceId: 'budget-savings',
          categoryIds: ['acc-savings'],
        },
      },
      {
        kind: 'TRANSFER',
        fromAccountId: 'cash',
        toAccountId: 'savings',
        amount: 120,
        dayOffset: 7,
        meta: {
          source: 'PLANNED',
          label: 'Monthly sweep',
          categoryId: 'acc-savings',
        },
      },
    ];

    const resolved = FlowResolver.resolveConflicts(flows);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].kind).toBe('TRANSFER');
    expect(resolved[0].amount).toBe(120);
    expect(resolved[0].meta?.source).toBe('RESOLVED');
  });
});
