import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import { BudgetUsage } from '@/src/services/budget/types';
import { convertAmount } from '@/src/services/currencyConversion';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import {
  AccountId,
  AccountSubtype,
  AccountType,
  BudgetId,
  PlannedPaymentId,
  WorkplaceId,
} from '@/src/types/domain';
import dayjs from 'dayjs';
import { cashFlowSimulationService, SimulationInput } from '../CashFlowSimulationService';
import { FlowSource } from '../types';

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    metric: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/account', () => ({
  accountQueryRepository: {
    findMetadataByAccountIds: jest.fn().mockResolvedValue([]),
  },
  accountRawRepository: {
    findManyByIdsRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    getScopes: jest.fn().mockResolvedValue([]),
    getScopesByBudgetIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/data/repositories/TransactionRawRepository', () => ({
  transactionRawRepository: {
    getLatestBalancesRaw: jest.fn().mockResolvedValue(new Map()),
    getAccountPeriodMetricsRaw: jest.fn().mockResolvedValue({ totalDecrease: 0, totalIncrease: 0 }),
    getJournalTransactionsForJournalsRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/data/repositories/PlannedPaymentRepository', () => ({
  plannedPaymentRepository: {
    findManyByIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/services/currencyConversion', () => ({
  convertAmount: jest.fn().mockResolvedValue({ ok: true, amount: 1 }),
}));

describe('CashFlowSimulationService - End-to-End Backend Pipeline', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const baseDate = dayjs('2026-04-01T00:00:00Z');

  // Mock accounts
  const cash = {
    id: 'acc-cash' as AccountId,
    name: 'Cash',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.BANK_CHECKING,
    currencyCode: 'USD',
  } as Account;
  const bank = {
    id: 'acc-bank' as AccountId,
    name: 'Bank Checking',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.BANK_CHECKING,
    currencyCode: 'USD',
  } as Account;
  const creditCard = {
    id: 'acc-cc' as AccountId,
    name: 'Credit Card',
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.CREDIT_CARD,
    currencyCode: 'USD',
    metadataRecords: {
      fetch: jest
        .fn()
        .mockResolvedValue([
          { statementDay: 1, dueDay: 15, gracePeriodDays: 14, payFromAccountId: bank.id },
        ]),
    },
  } as any;
  const groceriesCategory = {
    id: 'exp-groceries' as AccountId,
    name: 'Groceries',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  } as Account;
  const diningCategory = {
    id: 'exp-dining' as AccountId,
    name: 'Dining Out',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  } as Account;
  const incomeCategory = {
    id: 'inc-salary' as AccountId,
    name: 'Salary',
    accountType: AccountType.INCOME,
    currencyCode: 'USD',
  } as Account;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    (convertAmount as jest.Mock).mockImplementation(
      async ({ amount, fromCurrency, toCurrency }: any) => {
        if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
          return { ok: true, amount };
        }
        return { ok: true, amount };
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const simulate = (overrides: Partial<SimulationInput>) => {
    return cashFlowSimulationService.simulate({
      startingBalances: new Map([[cash.id, 5000]]),
      plannedPayments: [],
      plannedJournals: [],
      liquidAssetIds: [cash.id, bank.id],
      liabilityAccountBalances: [],
      budgets: [],
      usages: [],
      allAccounts: [cash, bank, creditCard, groceriesCategory, diningCategory, incomeCategory],
      resultCurrency: 'USD',
      workplaceId,
      simulationDays: 30,
      ...overrides,
    });
  };

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

      // Verify all flows are strictly timeline-ordered
      for (let i = 1; i < allFlows.length; i++) {
        expect(allFlows[i].dayOffset).toBeGreaterThanOrEqual(allFlows[i - 1].dayOffset);
      }

      // Check composed spending across both 30-day windows
      const aprilFlows = allFlows.filter(f => f.dayOffset < 30);
      const mayFlows = allFlows.filter(f => f.dayOffset >= 30);

      const aprilSpend = aprilFlows.reduce(
        (sum, f) => sum + (f.kind === 'OUTFLOW' ? f.amount : 0),
        0,
      );
      const maySpend = mayFlows.reduce((sum, f) => sum + (f.kind === 'OUTFLOW' ? f.amount : 0), 0);

      expect(aprilSpend).toBeCloseTo(578, 0);
      expect(maySpend).toBeCloseTo(578, 0);

      // Total safe to spend accounts for both months
      expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(
        5000 - (aprilSpend + maySpend),
        0,
      );
    });

    it('manages 90-day multi-cycle smoothing when enabled', async () => {
      const originalMode = AppConfig.defaults.budgetMode;
      (AppConfig.defaults as any).budgetMode = 'SMOOTHED';

      try {
        (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
          { budgetId: 'b-smoothed', accountId: groceriesCategory.id, account: groceriesCategory },
        ]);

        const result = await simulate({
          simulationDays: 90,
          startingBalances: new Map([[cash.id, 10000]]),
          budgets: [
            {
              id: 'b-smoothed' as BudgetId,
              name: 'Quarterly Allowance',
              amount: 900,
              assetAccountIds: cash.id,
              currencyCode: 'USD',
              intervalType: 'MONTHLY',
              intervalN: 1,
            } as any,
          ],
          usages: [{ remaining: 900, budgetAmount: 900, spent: 0, usagePercent: 0 } as BudgetUsage],
        });

        const flows = result.allFlows!;
        expect(flows.length).toBe(90);

        // Daily rate should be uniformly distributed
        const firstDayAmt = flows[0].amount;
        expect(flows.every(f => Math.abs(f.amount - firstDayAmt) < 0.01)).toBe(true);
      } finally {
        (AppConfig.defaults as any).budgetMode = originalMode;
      }
    });
  });

  describe('Multi-Account Liquid Asset Distribution', () => {
    it('distributes budget burn across multiple liquid funding accounts and tracks independent min balances', async () => {
      // Budget funded by Cash and Bank ($600 total over 30 days = 20/day -> split = 10 each)
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

      // Both accounts should receive equal half of the daily burn
      expect(cashFlows.length).toBe(30);
      expect(bankFlows.length).toBe(30);
      expect(cashFlows[0].amount).toBeCloseTo(10, 2); // 600 / 30 / 2 = 10
      expect(bankFlows[0].amount).toBeCloseTo(10, 2);

      // Verify individual account trajectory minimums
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
      (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
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
        // 1. Salary Inflow (+$3500 on the 10th into Bank)
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
          // 2. Loan EMI (-$400 on the 5th from Bank)
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
          // 3. Credit Card Spending (-$200 on the 5th, settled from Bank on May 15th)
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
        // 4. Dining Budget ($300/mo from Cash)
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

      // Salary on day 10 should be detected as first major inflow
      expect(summary.firstMajorInflowDay).toBe(10);

      // Verify no shortfalls
      expect(summary.shortfall).toBe(0);

      // Total liquid flows over 60 days:
      // Inflow: 2 salary occurrences = $7000
      // Outflows: 2 loan EMIs ($800) + 1 CC bill on May 15 ($200) + Dining Budget ($600) = $1600
      const totalOutflows = result
        .allFlows!.filter(f => f.kind === 'OUTFLOW')
        .reduce((sum, f) => sum + f.amount, 0);
      const totalInflows = result
        .allFlows!.filter(f => f.kind === 'INFLOW')
        .reduce((sum, f) => sum + f.amount, 0);

      expect(totalInflows).toBe(7000);
      expect(totalOutflows).toBeCloseTo(1590, 0);

      // Safe to spend reflects starting liquid balance ($5000) + net forward cash
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

      // Overdue payment should be clamped to day 0
      const day0Planned = result.allFlows!.find(
        f => f.dayOffset === 0 && f.origin === FlowSource.PLANNED_PAYMENT,
      );
      expect(day0Planned).toBeDefined();
      expect(day0Planned?.amount).toBe(100);

      // Remaining budget capacity ($500) burned over cycle
      expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(1426.67, 1);
    });
  });
});
