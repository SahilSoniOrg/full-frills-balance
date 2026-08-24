import { AppConfig } from '@/src/constants/app-config';
import Budget from '@/src/data/models/Budget';
import dayjs from 'dayjs';
import { budgetProjectionProvider } from '@/src/services/budget/budgetProjectionProvider';
import { BudgetFlowGenerator } from '../engines/BudgetFlowGenerator';
import { FlowCategory, FlowSource, ScheduledProjection, SimulationContext } from '../types';
import { AccountId } from '@/src/types/ids';

describe('BudgetReconciliation', () => {
  const simulationStartMs = dayjs('2026-04-01T00:00:00Z').valueOf();
  const safeToSpendDays = AppConfig.defaults.safeToSpendDays;
  const context: SimulationContext = {
    simulationStartMs,
    simulationDays: safeToSpendDays,
    simulationEndMs: simulationStartMs + safeToSpendDays * 24 * 60 * 60 * 1000,
    resultCurrency: 'USD',
    liquidAccountIds: new Set(['acc1' as AccountId]),
    orderedLiquidAccountIds: ['acc1' as AccountId],
    liabilityAccountIds: new Set([]),
    accountMap: new Map(),
    convert: amount => amount,
  };

  it('subtracts planned flows from budget burn to avoid double counting', () => {
    const budget = {
      id: 'b1',
      name: 'General',
      amount: 1000, // Monthly amount
      currencyCode: 'USD',
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 1,
    } as Budget;

    const usage = {
      budgetId: 'b1',
      remaining: 1000,
      total: 1000,
    };

    // Case 1: Overdue payment ($800) projected for today (dayOffset 0)
    const scheduledProjections: ScheduledProjection[] = [
      {
        sourceId: 'pp1',
        occurrenceDate: simulationStartMs,
        amount: 800,
        fromAccountId: 'acc1' as AccountId,
        toAccountId: 'cat1' as AccountId,
        category: FlowCategory.PLANNED_EXPENSE,
        timeframe: 'FUTURE',
        label: 'Overdue Bill',
        origin: FlowSource.PLANNED_PAYMENT,
        categoryId: 'cat1',
        isTransfer: false,
      },
    ];

    const budgetCategoryMap = new Map([['b1', new Set(['cat1'])]]);

    const capacities = budgetProjectionProvider.projectCapacities(
      context,
      [budget],
      [usage as any],
      budgetCategoryMap,
    );

    // When materialized with scheduled projections, remaining $200 is burned over the 29 non-planned days
    const budgetFlows = BudgetFlowGenerator.materializeFlows(
      context,
      capacities,
      scheduledProjections,
    );

    // Non-planned days burn $200 / 29 = $6.90/day, Day 0 has no duplicate budget burn
    expect(budgetFlows.find(f => f.dayOffset === 0)).toBeUndefined();
    expect(budgetFlows.length).toBe(safeToSpendDays - 1);

    const totalBurn = budgetFlows.reduce((sum, f) => sum + f.amount, 0);
    expect(totalBurn).toBeCloseTo(200, 2);
  });
});
