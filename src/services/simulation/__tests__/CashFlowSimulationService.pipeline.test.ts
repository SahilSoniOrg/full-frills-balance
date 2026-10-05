import Account from '@/src/data/models/Account';
import { BudgetUsage } from '@/src/services/budget/types';
import { AccountId, BudgetId, PlannedPaymentId } from '@/src/types/ids';
import { FlowSource } from '../types';
import {
  accountQueryRepository,
  budgetRepository,
  buildPipelineAccounts,
  buildPipelineSimulate,
  installCashFlowSimulationTestHooks,
  resolveSpotExchangeRate,
  transactionRawMetricsQueries,
} from './cashFlowSimulationTestHarness';

describe('CashFlowSimulationService - End-to-End Backend Pipeline', () => {
  const accounts = buildPipelineAccounts();
  const { baseDate, cash, bank, creditCard, groceriesCategory, diningCategory, incomeCategory } =
    accounts;
  const simulate = (overrides: Parameters<typeof buildPipelineSimulate>[1]) =>
    buildPipelineSimulate(accounts, overrides);

  installCashFlowSimulationTestHooks();

  describe('Delayed Discretization Across Multi-Cycle Windows (60 & 90 days)', () => {
    it('handles varying planned expense burdens across consecutive monthly cycles', async () => {
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-groceries', accountId: groceriesCategory.id, account: groceriesCategory },
      ]);

      const result = await simulate({
        simulationDays: 60,
        startingBalances: new Map([[cash.id, 5000]]),
        budgets: [
          {
            id: 'b-groceries' as BudgetId,
            name: 'Groceries Budget',
            amount: 600,
            assetAccountIds: cash.id,
            currencyCode: 'USD',
            intervalType: 'MONTHLY',
            intervalN: 1,
            recurrenceDay: 1,
          } as any,
        ],
        usages: [{ remaining: 600, budgetAmount: 600, spent: 0, usagePercent: 0 } as BudgetUsage],
        plannedPayments: [
          {
            id: 'pp-sub-apr' as PlannedPaymentId,
            name: 'April Meal Box',
            fromAccountId: cash.id,
            toAccountId: groceriesCategory.id,
            amount: 150,
            nextOccurrence: baseDate.add(10, 'day').valueOf(),
            intervalType: 'MONTHLY',
            intervalN: 1,
            currencyCode: 'USD',
          } as any,
        ],
      });

      expect(result.simulationResult).toBeDefined();
      const allFlows = result.allFlows!;
      expect(allFlows.length).toBeGreaterThan(0);

      for (let i = 1; i < allFlows.length; i++) {
        expect(allFlows[i].dayOffset).toBeGreaterThanOrEqual(allFlows[i - 1].dayOffset);
      }

      const aprilFlows = allFlows.filter(f => f.dayOffset < 30);
      const mayFlows = allFlows.filter(f => f.dayOffset >= 30);

      const aprilSpend = aprilFlows.reduce(
        (sum, f) => sum + (f.kind === 'OUTFLOW' ? f.amount : 0),
        0,
      );
      const maySpend = mayFlows.reduce((sum, f) => sum + (f.kind === 'OUTFLOW' ? f.amount : 0), 0);

      expect(aprilSpend).toBeCloseTo(600, 0);
      expect(maySpend).toBeCloseTo(585, 0);
      expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(
        5000 - (aprilSpend + maySpend),
        0,
      );
    });
  });

  describe('Multi-Account Liquid Asset Distribution', () => {
    it('distributes budget burn across multiple liquid funding accounts and tracks independent min balances', async () => {
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-shared', accountId: groceriesCategory.id, account: groceriesCategory },
      ]);

      const result = await simulate({
        startingBalances: new Map([
          [cash.id, 2000],
          [bank.id, 3000],
        ]),
        budgets: [
          {
            id: 'b-shared' as BudgetId,
            name: 'Shared Food',
            amount: 600,
            assetAccountIds: `${cash.id},${bank.id}`,
            currencyCode: 'USD',
            intervalType: 'MONTHLY',
          } as any,
        ],
        usages: [{ remaining: 600, budgetAmount: 600, spent: 0, usagePercent: 0 } as BudgetUsage],
      });

      const flows = result.allFlows!;
      const cashFlows = flows.filter(f => f.kind === 'OUTFLOW' && f.accountId === cash.id);
      const bankFlows = flows.filter(f => f.kind === 'OUTFLOW' && f.accountId === bank.id);

      expect(cashFlows.length).toBe(30);
      expect(bankFlows.length).toBe(30);
      expect(cashFlows[0].amount).toBeCloseTo(10, 2);
      expect(bankFlows[0].amount).toBeCloseTo(10, 2);

      const accountMins = result.simulationResult.summary.accountMinBalances;
      expect(accountMins.get(cash.id)).toBeCloseTo(2000 - 300, 1);
      expect(accountMins.get(bank.id)).toBeCloseTo(3000 - 300, 1);
    });
  });

  describe('Full Multi-Domain Integration Pipeline', () => {
    it('simulates concurrent Salary Income, Food Budget, Credit Card Due, and Loan EMI accurately', async () => {
      (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
        {
          accountId: creditCard.id,
          statementDay: 1,
          dueDay: 15,
          gracePeriodDays: 14,
          payFromAccountId: bank.id,
        },
      ]);
      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
        new Map([[creditCard.id, 0]]),
      );
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-dining', accountId: diningCategory.id, account: diningCategory },
      ]);

      const result = await simulate({
        simulationDays: 60,
        startingBalances: new Map([
          [cash.id, 1000],
          [bank.id, 4000],
        ]),
        liabilityAccountBalances: [{ account: creditCard, balance: 0 }],
        plannedPayments: [
          {
            id: 'pp-salary' as PlannedPaymentId,
            name: 'Monthly Salary',
            fromAccountId: incomeCategory.id,
            toAccountId: bank.id,
            amount: 3500,
            nextOccurrence: baseDate.add(10, 'day').valueOf(),
            intervalType: 'MONTHLY',
            currencyCode: 'USD',
          } as any,
          {
            id: 'pp-loan-emi' as PlannedPaymentId,
            name: 'Car Loan EMI',
            fromAccountId: bank.id,
            toAccountId: 'acc-loan' as AccountId,
            amount: 400,
            nextOccurrence: baseDate.add(5, 'day').valueOf(),
            intervalType: 'MONTHLY',
            currencyCode: 'USD',
          } as any,
          {
            id: 'pp-cc-spend' as PlannedPaymentId,
            name: 'Credit Card Dine Out',
            fromAccountId: creditCard.id,
            toAccountId: diningCategory.id,
            amount: 200,
            nextOccurrence: baseDate.add(5, 'day').valueOf(),
            intervalType: 'MONTHLY',
            currencyCode: 'USD',
          } as any,
        ],
        budgets: [
          {
            id: 'b-dining' as BudgetId,
            name: 'Dining',
            amount: 300,
            assetAccountIds: cash.id,
            currencyCode: 'USD',
            intervalType: 'MONTHLY',
          } as any,
        ],
        usages: [{ remaining: 300, budgetAmount: 300, spent: 0, usagePercent: 0 } as BudgetUsage],
      });

      const summary = result.simulationResult.summary;
      expect(summary.firstMajorInflowDay).toBe(10);
      expect(summary.shortfall).toBe(0);

      const totalOutflows = result
        .allFlows!.filter(f => f.kind === 'OUTFLOW')
        .reduce((sum, f) => sum + f.amount, 0);
      const totalInflows = result
        .allFlows!.filter(f => f.kind === 'INFLOW')
        .reduce((sum, f) => sum + f.amount, 0);

      expect(totalInflows).toBe(7000);
      expect(totalOutflows).toBeCloseTo(1597, 0);
      expect(summary.safeToSpend).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases & Zero-Value Bounds', () => {
    it('handles zero-capacity budgets and empty planned payments gracefully without NaN or errors', async () => {
      const result = await simulate({
        startingBalances: new Map([[cash.id, 1000]]),
        budgets: [
          {
            id: 'b-zero' as BudgetId,
            name: 'Zero Budget',
            amount: 0,
            assetAccountIds: cash.id,
            currencyCode: 'USD',
          } as any,
        ],
        usages: [{ remaining: 0, budgetAmount: 0, spent: 0, usagePercent: 0 } as BudgetUsage],
      });

      expect(result.simulationResult.summary.safeToSpend).toBe(1000);
      expect(result.simulationResult.summary.shortfall).toBe(0);
      expect(result.allFlows).toHaveLength(0);
    });

    it('clamps overdue planned payments to day 0 without breaking budget period subtraction', async () => {
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-groceries', accountId: groceriesCategory.id, account: groceriesCategory },
      ]);

      const overdueTimestamp = baseDate.subtract(3, 'day').valueOf();

      const result = await simulate({
        startingBalances: new Map([[cash.id, 2000]]),
        budgets: [
          {
            id: 'b-groceries' as BudgetId,
            name: 'Groceries',
            amount: 600,
            assetAccountIds: cash.id,
            currencyCode: 'USD',
            intervalType: 'MONTHLY',
          } as any,
        ],
        usages: [{ remaining: 600, budgetAmount: 600, spent: 0, usagePercent: 0 } as BudgetUsage],
        plannedPayments: [
          {
            id: 'pp-overdue' as PlannedPaymentId,
            name: 'Overdue Subscription',
            fromAccountId: cash.id,
            toAccountId: groceriesCategory.id,
            amount: 100,
            nextOccurrence: overdueTimestamp,
            intervalType: 'MONTHLY',
            currencyCode: 'USD',
          } as any,
        ],
      });

      const day0Planned = result.allFlows!.find(
        f => f.dayOffset === 0 && f.origin === FlowSource.PLANNED_PAYMENT,
      );
      expect(day0Planned).toBeDefined();
      expect(day0Planned?.amount).toBe(100);
      expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(1400, 0);
    });
  });

  it.each([
    ['KWD', 1.001, 3],
    ['JPY', 500, 0],
  ])(
    'keeps %s budget slices fractional until production totals are materialized',
    async (currency, amount, precision) => {
      const accountSet = [
        cash,
        bank,
        creditCard,
        groceriesCategory,
        diningCategory,
        incomeCategory,
      ].map(account => ({ ...account, currencyCode: currency }) as Account);
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-precision', accountId: groceriesCategory.id, account: groceriesCategory },
      ]);

      const result = await simulate({
        startingBalances: new Map([[cash.id, 10_000]]),
        liquidAssetIds: [cash.id],
        budgets: [
          {
            id: 'b-precision' as BudgetId,
            name: 'Precision budget',
            amount,
            assetAccountIds: cash.id,
            currencyCode: currency,
            intervalType: 'MONTHLY',
            intervalN: 1,
            startDate: baseDate.startOf('month').valueOf(),
            recurrenceDay: 1,
          } as any,
        ],
        usages: [
          { remaining: amount, budgetAmount: amount, spent: 0, usagePercent: 0 } as BudgetUsage,
        ],
        allAccounts: accountSet,
        resultCurrency: currency,
      });

      const budgetFlows = result.allFlows!.filter(flow => flow.category === 'BUDGET');
      const allocated = budgetFlows.reduce((sum, flow) => sum + flow.amount, 0);
      const roundedAmount = Number(amount.toFixed(precision));
      expect(budgetFlows.length).toBeGreaterThan(1);
      expect(budgetFlows.some(flow => flow.amount !== Number(flow.amount.toFixed(precision)))).toBe(
        true,
      );
      expect(allocated).toBeCloseTo(amount, 10);
      expect(result.simulationResult.summary.safeToSpend).toBe(
        Number((10_000 - amount).toFixed(precision)),
      );
      expect(
        result.report.budget.currentMonthRemaining + result.report.budget.nextMonthProjected,
      ).toBe(roundedAmount);
      expect(result.report.summary.totalCommittedPlanned).toBe(roundedAmount);
    },
  );

  it('keeps missing foreign spot rates visible as unvalued simulation entries', async () => {
    const euroAccount = { ...cash, id: 'acc-euro' as AccountId, currencyCode: 'EUR' } as Account;
    (resolveSpotExchangeRate as jest.Mock).mockResolvedValue({ ok: false, reason: 'missing_rate' });

    const result = await simulate({
      startingBalances: new Map([[euroAccount.id, 250]]),
      liquidAssetIds: [euroAccount.id],
      allAccounts: [euroAccount],
      resultCurrency: 'USD',
    });

    expect(result.hasUnvaluedEntries).toBe(true);
    expect(result.simulationResult.summary.safeToSpend).toBe(0);
  });
});
