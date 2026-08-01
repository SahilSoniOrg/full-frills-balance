import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
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
    const flows = BudgetFlowGenerator.generate(mockContext, budgets, usages, budgetCategoryMap);

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

    const flows = BudgetFlowGenerator.generate(
      contextWithTwoAccounts,
      multiAccountBudget as unknown as Budget[],
      [{ spent: 0, remaining: 100, budgetAmount: 100, usagePercent: 0 }] as BudgetUsage[],
      new Map([['b2', new Set()]]),
    );

    // 100 / 10 days = 10 per day. Split between 2 accounts = 5 each.
    // Total flows = 10 days * 2 accounts = 20 flows.
    expect(
      flows.filter(f => 'accountId' in f && f.accountId === ('acc-1' as AccountId)),
    ).toHaveLength(30); // because simulationDays = 30
    // Wait, simulationDays is 30, but daysLeftInMonth is 10.
    // So days 0-9 use currentMonthDailyRate (100/10 = 10), days 10-29 use nextMonthDailyRate (100/30 = 3.33).
    const day0Acc1 = flows.find(
      f => f.dayOffset === 0 && 'accountId' in f && f.accountId === ('acc-1' as AccountId),
    );
    expect(day0Acc1 && 'amount' in day0Acc1 ? day0Acc1.amount : 0).toBeCloseTo(1.67, 2);
  });

  it('burns a daily budget at the full daily amount, not a monthly 30-day rate', () => {
    const originalMode = AppConfig.defaults.budgetMode;
    (AppConfig.defaults as { budgetMode: 'SMOOTHED' | 'ACTUAL' }).budgetMode = 'ACTUAL';

    try {
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

      const flows = BudgetFlowGenerator.generate(
        mockContext,
        dailyBudgets,
        [{ spent: 0, remaining: 100, budgetAmount: 100, usagePercent: 0 }],
        new Map([['b-daily', new Set(['cat-1'])]]),
      );

      expect(flows).toHaveLength(30);
      expect(flows[0].amount).toBeCloseTo(100, 5);
      expect(flows[1].amount).toBeCloseTo(100, 5);
      expect(flows.every(f => Math.abs(f.amount - 100) < 1e-9)).toBe(true);
    } finally {
      (AppConfig.defaults as { budgetMode: 'SMOOTHED' | 'ACTUAL' }).budgetMode = originalMode;
    }
  });
});
