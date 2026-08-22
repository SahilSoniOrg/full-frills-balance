import { ProjectionComposer } from '@/src/services/simulation/ProjectionComposer';
import {
  BudgetCapacityProjection,
  FlowCategory,
  FlowSource,
  ScheduledProjection,
  SimulationContext,
} from '@/src/services/simulation/types';
import { AccountId } from '@/src/types/domain';
import dayjs from 'dayjs';

describe('ProjectionComposer', () => {
  const simulationStartMs = dayjs('2026-08-01T00:00:00Z').valueOf();
  const context: SimulationContext = {
    simulationStartMs,
    simulationDays: 2,
    simulationEndMs: simulationStartMs + 2 * 24 * 60 * 60 * 1000,
    resultCurrency: 'USD',
    liquidAccountIds: new Set(['cash' as AccountId]),
    orderedLiquidAccountIds: ['cash' as AccountId],
    liabilityAccountIds: new Set([]),
    accountMap: new Map(),
    convert: amount => amount,
  };

  it('reconciles correctly when every remaining day has matching planned spend (no non-planned days)', () => {
    // 2 remaining days in cycle: Aug 1 to Aug 2
    // Budget remaining: $100
    // Day 0 planned: $10
    // Day 1 planned: $10
    // Expected:
    // - Planned payments emit $10 on Day 0 and $10 on Day 1 (total $20)
    // - Residual budget ($80) is distributed across the 2 active days ($40 on Day 0, $40 on Day 1)
    // - Composed total is exactly $100 (never double-deducted or truncated to max)
    const budgetCapacities: BudgetCapacityProjection[] = [
      {
        budgetId: 'b-food',
        name: 'Food Budget',
        accountScope: new Set(['exp-groceries']),
        targetAssetAccountIds: ['cash' as AccountId],
        intervalType: 'MONTHLY',
        cycles: [
          {
            startDate: simulationStartMs,
            endDate: simulationStartMs + 2 * 24 * 60 * 60 * 1000 - 1,
            capacity: 100,
            remainingCapacity: 100,
          },
        ],
      },
    ];

    const scheduledProjections: ScheduledProjection[] = [
      {
        sourceId: 'pp-1',
        occurrenceDate: simulationStartMs, // Day 0
        amount: 10,
        fromAccountId: 'cash' as AccountId,
        toAccountId: 'exp-groceries' as AccountId,
        category: FlowCategory.PLANNED_EXPENSE,
        timeframe: 'FUTURE',
        label: 'Planned Grocery Day 0',
        origin: FlowSource.PLANNED_PAYMENT,
        categoryId: 'exp-groceries',
        isTransfer: false,
      },
      {
        sourceId: 'pp-2',
        occurrenceDate: simulationStartMs + 24 * 60 * 60 * 1000, // Day 1
        amount: 10,
        fromAccountId: 'cash' as AccountId,
        toAccountId: 'exp-groceries' as AccountId,
        category: FlowCategory.PLANNED_EXPENSE,
        timeframe: 'FUTURE',
        label: 'Planned Grocery Day 1',
        origin: FlowSource.PLANNED_PAYMENT,
        categoryId: 'exp-groceries',
        isTransfer: false,
      },
    ];

    const composed = ProjectionComposer.composeSpending(
      budgetCapacities,
      scheduledProjections,
      context,
    );

    const totalComposed = composed.reduce((sum, f) => sum + f.amount, 0);
    expect(totalComposed).toBe(100);

    const day0Flows = composed.filter(f => f.dayOffset === 0);
    const day1Flows = composed.filter(f => f.dayOffset === 1);

    expect(day0Flows.reduce((sum, f) => sum + f.amount, 0)).toBe(50); // $40 budget + $10 planned
    expect(day1Flows.reduce((sum, f) => sum + f.amount, 0)).toBe(50); // $40 budget + $10 planned
  });
});
