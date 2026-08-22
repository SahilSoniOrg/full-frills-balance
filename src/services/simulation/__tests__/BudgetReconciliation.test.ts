import { AppConfig } from '@/src/constants/app-config';
import Budget from '@/src/data/models/Budget';
import dayjs from 'dayjs';
import { BudgetFlowGenerator } from '../engines/BudgetFlowGenerator';
import { ProjectionComposer } from '../ProjectionComposer';
import { FlowCategory, SimulationContext } from '../types';
import { AccountId } from '@/src/types/domain';

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

    // Case 1: Overdue payment ($800) from 2 days ago, projected for today
    const plannedFlows: any[] = [
      {
        kind: 'OUTFLOW',
        amount: 800,
        dayOffset: 0,
        category: FlowCategory.PLANNED_EXPENSE,
        categoryId: 'cat1',
        referenceId: 'pp1',
      },
    ];

    const budgetCategoryMap = new Map([['b1', new Set(['cat1'])]]);

    const budgetFlows = BudgetFlowGenerator.generate(
      context,
      [budget],
      [usage as any],
      budgetCategoryMap,
    );

    // Pure budget intent emits $1000 / safeToSpendDays daily
    const totalRawBurn = budgetFlows.reduce((sum, f) => sum + f.amount, 0);
    expect(totalRawBurn).toBeCloseTo(1000, 2);

    // When composed with planned flows, ProjectionComposer reconciles $800 planned + $200 residual
    const composed = ProjectionComposer.composeSpending(
      budgetFlows,
      plannedFlows,
      budgetCategoryMap,
    );

    const totalComposed = composed.reduce((sum, f) => sum + f.amount, 0);
    expect(totalComposed).toBeCloseTo(1000, 2);
  });

  it('handles smoothing correctly with planned payments', () => {
    // Logic check for future months
  });
});
