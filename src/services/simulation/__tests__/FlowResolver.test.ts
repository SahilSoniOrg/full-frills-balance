import { FlowResolver } from '@/src/services/simulation/FlowResolver';
import { Flow } from '@/src/services/simulation/types';

describe('FlowResolver', () => {
  it('reconciles budget burns against planned spend when category metadata is an iterable', () => {
    const budgetFlow: Flow = {
      kind: 'OUTFLOW',
      accountId: 'cash',
      amount: 80,
      dayOffset: 0,
      meta: {
        source: 'BUDGET',
        label: 'Food Budget',
        referenceId: 'b-food',
        categoryId: 'exp-groceries',
        categoryIds: new Set(['exp-groceries']) as any,
      },
    };

    const plannedFlow: Flow = {
      kind: 'OUTFLOW',
      accountId: 'cash',
      amount: 50,
      dayOffset: 0,
      meta: {
        source: 'PLANNED',
        label: 'Groceries Spend',
        referenceId: 'pp-groceries',
        categoryId: 'exp-groceries',
      },
    };

    const resolved = FlowResolver.resolveConflicts([budgetFlow, plannedFlow]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].meta?.source).toBe('RESOLVED');
    expect(resolved[0].meta?.originalSource).toBe('BUDGET');
    expect(resolved[0].amount).toBe(80);
  });
});
