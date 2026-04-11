import { FlowResolver } from '@/src/services/simulation/FlowResolver';
import { Flow, FlowCategory, FlowSource } from '@/src/services/simulation/types';

describe('FlowResolver', () => {
  it('reconciles budget burns against planned spend', () => {
    const budgetFlow: Flow = {
      kind: 'OUTFLOW',
      accountId: 'cash',
      amount: 80,
      dayOffset: 0,
      category: FlowCategory.BUDGET,
      timeframe: 'FUTURE',
      label: 'Food Budget',
      origin: FlowSource.BUDGET,
      referenceId: 'b-food',
      categoryId: 'exp-groceries',
    };

    const plannedFlow: Flow = {
      kind: 'OUTFLOW',
      accountId: 'cash',
      amount: 50,
      dayOffset: 0,
      category: FlowCategory.PLANNED_EXPENSE,
      timeframe: 'FUTURE',
      label: 'Groceries Spend',
      origin: FlowSource.PLANNED_PAYMENT,
      referenceId: 'pp-groceries',
      categoryId: 'exp-groceries',
    };

    const resolved = FlowResolver.resolveConflicts([budgetFlow, plannedFlow]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolvedFrom).toBe(FlowSource.BUDGET);
    expect(resolved[0].amount).toBe(80);
    expect(resolved[0].category).toBe(FlowCategory.BUDGET); // Unchanged category
  });
});
