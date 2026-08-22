import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import { budgetProjectionProvider } from '@/src/services/budget/budgetProjectionProvider';
import { BudgetUsage } from '@/src/services/budget/types';
import { AccountId } from '@/src/types/domain';
import { SimulationContext } from '../../types';
import { BudgetFlowGenerator } from '../BudgetFlowGenerator';

describe('BudgetFlowGenerator', () => {
  const mockContext: SimulationContext = {
    simulationStartMs: 1711929600000, // 2024-04-01
    simulationDays: 30,
    simulationEndMs: 1714521600000,
    resultCurrency: 'USD',
    liquidAccountIds: new Set<AccountId>(['acc-1' as AccountId]),
    orderedLiquidAccountIds: ['acc-1' as AccountId],
    liabilityAccountIds: new Set<AccountId>(),
    accountMap: new Map<AccountId, Account>(),
    convert: (amount: number) => amount,
  };

  const budgets = [
    {
      id: 'b1',
      name: 'Groceries',
      amount: 300,
      assetAccountIds: 'acc-1',
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 1,
    },
  ] as unknown as Budget[];
  const usages: BudgetUsage[] = [{ spent: 0, remaining: 300, budgetAmount: 300, usagePercent: 0 }];
  const budgetCategoryMap: Map<string, Set<string>> = new Map([['b1', new Set(['cat-1'])]]);

  it('generates daily burn flows in default mode', () => {
    // 300 remaining over 30 days = 10 per day
    const capacities = budgetProjectionProvider.projectCapacities(
      mockContext,
      budgets,
      usages,
      budgetCategoryMap,
    );
    const { budgetFlows: flows } = BudgetFlowGenerator.materializeFlows(mockContext, capacities);

    expect(flows).toHaveLength(30);
    expect(flows[0]).toMatchObject({
      kind: 'OUTFLOW',
      accountId: 'acc-1' as AccountId,
      amount: 10,
      dayOffset: 0,
      origin: 'BUDGET',
      label: 'Groceries',
    });
  });

  it('respects assetAccountIds and distributes burn', () => {
    const multiAccountBudget = [
      { id: 'b2', name: 'Fun', amount: 100, assetAccountIds: 'acc-1,acc-2' },
    ];
    const contextWithTwoAccounts = {
      ...mockContext,
      liquidAccountIds: new Set<AccountId>(['acc-1' as AccountId, 'acc-2' as AccountId]),
      orderedLiquidAccountIds: ['acc-1' as AccountId, 'acc-2' as AccountId],
    };

    const capacities = budgetProjectionProvider.projectCapacities(
      contextWithTwoAccounts,
      multiAccountBudget as unknown as Budget[],
      [{ spent: 0, remaining: 100, budgetAmount: 100, usagePercent: 0 }] as BudgetUsage[],
      new Map([['b2', new Set()]]),
    );
    const { budgetFlows: flows } = BudgetFlowGenerator.materializeFlows(
      contextWithTwoAccounts,
      capacities,
    );

    expect(
      flows.filter(f => 'accountId' in f && f.accountId === ('acc-1' as AccountId)),
    ).toHaveLength(30);
    const day0Acc1 = flows.find(
      f => f.dayOffset === 0 && 'accountId' in f && f.accountId === ('acc-1' as AccountId),
    );
    expect(day0Acc1 && 'amount' in day0Acc1 ? day0Acc1.amount : 0).toBeCloseTo(1.67, 2);
  });

  it('keeps future days at the full daily amount after today is fully spent', () => {
    const dailyBudgets = [
      {
        id: 'b-daily-spent',
        name: 'Daily Allowance',
        amount: 4000,
        assetAccountIds: 'acc-1',
        intervalType: 'DAILY',
        intervalN: 1,
        startDate: mockContext.simulationStartMs,
      },
    ] as unknown as Budget[];

    const capacities = budgetProjectionProvider.projectCapacities(
      mockContext,
      dailyBudgets,
      [{ spent: 4000, remaining: 0, budgetAmount: 4000, usagePercent: 1 }],
      new Map([['b-daily-spent', new Set(['cat-1'])]]),
    );
    const { budgetFlows: flows } = BudgetFlowGenerator.materializeFlows(mockContext, capacities);

    expect(flows.find(f => f.dayOffset === 0)).toBeUndefined();
    expect(flows).toHaveLength(29);
    expect(flows.every(f => Math.abs(f.amount - 4000) < 1e-9)).toBe(true);
  });

  it('burns a daily budget at the full daily amount, not a monthly 30-day rate', () => {
    const dailyBudgets = [
      {
        id: 'b-daily',
        name: 'Daily Coffee',
        amount: 100,
        assetAccountIds: 'acc-1',
        intervalType: 'DAILY',
        intervalN: 1,
        startDate: mockContext.simulationStartMs,
      },
    ] as unknown as Budget[];

    const capacities = budgetProjectionProvider.projectCapacities(
      mockContext,
      dailyBudgets,
      [{ spent: 0, remaining: 100, budgetAmount: 100, usagePercent: 0 }],
      new Map([['b-daily', new Set(['cat-1'])]]),
    );
    const { budgetFlows: flows } = BudgetFlowGenerator.materializeFlows(mockContext, capacities);

    expect(flows).toHaveLength(30);
    expect(flows[0].amount).toBeCloseTo(100, 5);
    expect(flows[1].amount).toBeCloseTo(100, 5);
    expect(flows.every(f => Math.abs(f.amount - 100) < 1e-9)).toBe(true);
  });
});
