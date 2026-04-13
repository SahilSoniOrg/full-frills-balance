import dayjs from 'dayjs';
import { BudgetFlowGenerator } from '../engines/BudgetFlowGenerator';
import { FlowCategory, FlowSource, SimulationContext } from '../types';
import Budget from '@/src/data/models/Budget';

describe('BudgetReconciliation', () => {
  const simulationStartMs = dayjs('2026-04-12T00:00:00Z').valueOf();
  const context: SimulationContext = {
    simulationStartMs,
    simulationDays: 30,
    simulationEndMs: simulationStartMs + 30 * 24 * 60 * 60 * 1000,
    resultCurrency: 'USD',
    liquidAccountIds: new Set(['acc1']),
    orderedLiquidAccountIds: ['acc1'],
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
      30, // 30 days left
      30, // next month days
      budgetCategoryMap,
      plannedFlows,
    );

    // Total budget was $1000. Planned was $800.
    // Remaining for burn should be $200.
    // Daily burn over 30 days = $200 / 30 = 6.666...
    const day0Burn = budgetFlows.find(f => f.dayOffset === 0);
    expect(day0Burn?.amount).toBeCloseTo(200 / 30, 2);

    const totalBurn = budgetFlows.reduce((sum, f) => sum + f.amount, 0);
    expect(totalBurn).toBeCloseTo(200, 2);
  });

  it('handles smoothing correctly with planned payments', () => {
    // Logic check for future months
  });
});
