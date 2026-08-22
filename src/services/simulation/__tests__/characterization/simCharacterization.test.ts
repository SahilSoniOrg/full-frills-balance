import {
  AccountId,
  AccountSubtype,
  AccountType,
  BudgetId,
  PlannedPaymentId,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  WorkplaceId,
} from '@/src/types/domain';

import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { FlowCategory, FlowSource } from '@/src/services/simulation/types';

jest.mock('@/src/data/repositories/TransactionRawRepository', () => ({
  transactionRawRepository: {
    getLatestBalancesRaw: jest.fn().mockResolvedValue(new Map()),
    getAccountPeriodMetricsRaw: jest.fn().mockResolvedValue({ totalDecrease: 0, totalIncrease: 0 }),
  },
}));

jest.mock('@/src/data/repositories/transaction', () => ({
  ...jest.requireActual('@/src/data/repositories/transaction'),
  transactionQueryRepository: {
    findByJournals: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    getScopes: jest.fn().mockResolvedValue([]),
    getScopesByBudgetIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/data/repositories/account', () => ({
  ...jest.requireActual('@/src/data/repositories/account'),
  accountQueryRepository: {
    findMetadataByAccountIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/src/services/currencyConversion', () => ({
  convertAmount: jest.fn(async ({ amount }: any) => {
    return { ok: true, amount };
  }),
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    metric: jest.fn(),
  },
}));

describe('Forward-Finance Characterization Baseline (Behavior Locks)', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const liquidAccountId = 'acc-checking' as AccountId;
  const savingsAccountId = 'acc-savings' as AccountId;
  const creditCardAccountId = 'acc-credit-card' as AccountId;
  const foodExpenseAccountId = 'acc-food-leaf' as AccountId;
  const rentExpenseAccountId = 'acc-rent-leaf' as AccountId;

  const checkingAccount = {
    id: liquidAccountId,
    name: 'Main Checking',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.BANK_CHECKING,
    currencyCode: 'USD',
    workplaceId,
  } as unknown as Account;

  const savingsAccount = {
    id: savingsAccountId,
    name: 'High Yield Savings',
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.BANK_SAVINGS,
    currencyCode: 'USD',
    workplaceId,
  } as unknown as Account;

  const creditCardAccount = {
    id: creditCardAccountId,
    name: 'Primary CC',
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.CREDIT_CARD,
    currencyCode: 'USD',
    workplaceId,
  } as unknown as Account;

  const foodExpenseAccount = {
    id: foodExpenseAccountId,
    name: 'Groceries Leaf',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    workplaceId,
  } as unknown as Account;

  const rentExpenseAccount = {
    id: rentExpenseAccountId,
    name: 'Rent Leaf',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    workplaceId,
  } as unknown as Account;

  const baseAccounts = [
    checkingAccount,
    savingsAccount,
    creditCardAccount,
    foodExpenseAccount,
    rentExpenseAccount,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('LOCK 1: pure budget burn with no planned payments', async () => {
    const budgetId = 'b-food' as BudgetId;
    const foodBudget = {
      id: budgetId,
      name: 'Food & Dining',
      amount: 900,
      currencyCode: 'USD',
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 1,
      assetAccountIds: liquidAccountId,
      workplaceId,
    } as unknown as Budget;

    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId, accountId: foodExpenseAccountId, workplaceId },
    ]);

    const result = await cashFlowSimulationService.simulate({
      startingBalances: new Map([[liquidAccountId, 3000]]),
      liquidAssetIds: [liquidAccountId],
      liabilityAccountBalances: [],
      allAccounts: baseAccounts,
      budgets: [foodBudget],
      usages: [{ spent: 0, remaining: 900, budgetAmount: 900, usagePercent: 0 }],
      plannedPayments: [],
      plannedJournals: [],
      resultCurrency: 'USD',
      workplaceId,
      simulationDays: 30,
    });

    // 900 / 30 days = 30 USD daily burn
    const budgetFlows = result.allFlows.filter(f => f.category === FlowCategory.BUDGET);
    expect(budgetFlows.length).toBe(30);
    expect(budgetFlows[0].amount).toBe(30);
    expect(result.simulationResult.summary.safeToSpend).toBe(2100);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(2100);
  });

  it('LOCK 2: discrete planned payment (income + expense + internal transfer)', async () => {
    const salary = {
      id: 'pp-salary' as PlannedPaymentId,
      name: 'Monthly Salary',
      amount: 5000,
      currencyCode: 'USD',
      fromAccountId: 'acc-employer' as AccountId,
      toAccountId: liquidAccountId,
      nextOccurrence: new Date('2026-04-10T00:00:00Z').getTime(),
      intervalType: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    } as unknown as PlannedPayment;

    const rent = {
      id: 'pp-rent' as PlannedPaymentId,
      name: 'Apartment Rent',
      amount: 1500,
      currencyCode: 'USD',
      fromAccountId: liquidAccountId,
      toAccountId: rentExpenseAccountId,
      nextOccurrence: new Date('2026-04-05T00:00:00Z').getTime(),
      intervalType: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    } as unknown as PlannedPayment;

    const transferToSavings = {
      id: 'pp-save' as PlannedPaymentId,
      name: 'Emergency Fund Transfer',
      amount: 500,
      currencyCode: 'USD',
      fromAccountId: liquidAccountId,
      toAccountId: savingsAccountId,
      nextOccurrence: new Date('2026-04-15T00:00:00Z').getTime(),
      intervalType: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    } as unknown as PlannedPayment;

    const result = await cashFlowSimulationService.simulate({
      startingBalances: new Map([
        [liquidAccountId, 2000],
        [savingsAccountId, 1000],
      ]),
      liquidAssetIds: [liquidAccountId, savingsAccountId],
      liabilityAccountBalances: [],
      allAccounts: baseAccounts,
      budgets: [],
      usages: [],
      plannedPayments: [salary, rent, transferToSavings],
      plannedJournals: [],
      resultCurrency: 'USD',
      workplaceId,
      simulationDays: 30,
    });

    const plannedFlows = result.allFlows.filter(f => f.origin === FlowSource.PLANNED_PAYMENT);
    expect(plannedFlows.length).toBe(3);

    // Initial total liquid = 3000. Rent drops liquid by 1500 on day 4 (2000-1500=500 checking + 1000 savings = 1500 total).
    // Min trajectory before salary is 1500.
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1500);
    expect(result.simulationResult.summary.safeToSpend).toBe(1500);
  });

  it('LOCK 3: category overlap deduplication (Budget ₹20k + Planned ₹5k = ₹20k total, not ₹25k)', async () => {
    const budgetId = 'b-food' as BudgetId;
    const foodBudget = {
      id: budgetId,
      name: 'Food',
      amount: 600,
      currencyCode: 'USD',
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 1,
      assetAccountIds: liquidAccountId,
      workplaceId,
    } as unknown as Budget;

    const mealSubscription = {
      id: 'pp-meal' as PlannedPaymentId,
      name: 'Meal Subscription',
      amount: 150,
      currencyCode: 'USD',
      fromAccountId: liquidAccountId,
      toAccountId: foodExpenseAccountId, // Targets food expense category
      nextOccurrence: new Date('2026-04-10T00:00:00Z').getTime(),
      intervalType: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    } as unknown as PlannedPayment;

    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId, accountId: foodExpenseAccountId, workplaceId },
    ]);

    const result = await cashFlowSimulationService.simulate({
      startingBalances: new Map([[liquidAccountId, 2000]]),
      liquidAssetIds: [liquidAccountId],
      liabilityAccountBalances: [],
      allAccounts: baseAccounts,
      budgets: [foodBudget],
      usages: [{ spent: 0, remaining: 600, budgetAmount: 600, usagePercent: 0 }],
      plannedPayments: [mealSubscription],
      plannedJournals: [],
      resultCurrency: 'USD',
      workplaceId,
      simulationDays: 30,
    });

    // Total effective food spend composes to $150 planned + 29 * $15 residual burn = $585 (not 600 + 150 = 750)
    // 2000 starting - 585 total projected food = 1415 SafeToSpend
    expect(result.simulationResult.summary.safeToSpend).toBe(1415);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1415);
  });

  it('LOCK 4: credit card statement obligation and settlement matching', async () => {
    (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
      {
        accountId: creditCardAccountId,
        statementDay: 15,
        dueDay: 5,
        payFromAccountId: liquidAccountId,
      },
    ]);

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([[creditCardAccountId, 800]]),
    );

    const ccPayment = {
      id: 'pp-cc-pay' as PlannedPaymentId,
      name: 'Pay CC Bill',
      amount: 800,
      currencyCode: 'USD',
      fromAccountId: liquidAccountId,
      toAccountId: creditCardAccountId,
      nextOccurrence: new Date('2026-04-04T00:00:00Z').getTime(), // 1 day before due date
      intervalType: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    } as unknown as PlannedPayment;

    const result = await cashFlowSimulationService.simulate({
      startingBalances: new Map([[liquidAccountId, 3000]]),
      liquidAssetIds: [liquidAccountId],
      liabilityAccountBalances: [{ account: creditCardAccount, balance: 800 }],
      allAccounts: baseAccounts,
      budgets: [],
      usages: [],
      plannedPayments: [ccPayment],
      plannedJournals: [],
      resultCurrency: 'USD',
      workplaceId,
      simulationDays: 30,
    });

    // The transfer flow covers the statement obligation, preventing double-deduction
    const transferFlow = result.allFlows.find(f => f.kind === 'TRANSFER');
    expect(transferFlow).toBeDefined();
    expect(transferFlow?.amount).toBe(800);

    // 3000 starting - 800 payment = 2200
    expect(result.simulationResult.summary.safeToSpend).toBe(2200);
  });
});
