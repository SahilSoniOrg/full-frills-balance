import { AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId, BudgetId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { convertAmount } from '@/src/services/currencyConversion';
import {
  cashFlowSimulationService,
  SimulationInput,
} from '@/src/services/simulation/CashFlowSimulationService';
import { FlowSource } from '@/src/services/simulation/types';
import dayjs from 'dayjs';

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    metric: jest.fn(),
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
  },
}));

jest.mock('@/src/data/repositories/transaction', () => ({
  ...jest.requireActual('@/src/data/repositories/transaction'),

  transactionQueryRepository: {
    findByJournals: jest.fn().mockResolvedValue([]),
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
  convertAmount: jest.fn(async ({ amount, fromCurrency, toCurrency }: any) => ({
    ok: true,
    amount: fromCurrency === toCurrency ? amount : amount,
  })),
}));

describe('CashFlowSimulationService scenario coverage', () => {
  const cash = {
    id: 'cash' as AccountId,
    name: 'Checking',
    accountType: AccountType.ASSET,
    accountSubtype: 'CHECKING',
    currencyCode: 'USD',
  } as any;

  const savings = {
    id: 'savings' as AccountId,
    name: 'Savings',
    accountType: AccountType.ASSET,
    accountSubtype: 'SAVINGS',
    currencyCode: 'USD',
  } as any;

  const groceries = {
    id: 'exp-groceries' as AccountId,
    name: 'Groceries',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  } as any;

  const dining = {
    id: 'exp-dining' as AccountId,
    name: 'Dining',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  } as any;

  const cc = {
    id: 'cc' as AccountId,
    name: 'Credit Card',
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.CREDIT_CARD,
    currencyCode: 'USD',
    metadataRecords: {
      fetch: jest
        .fn()
        .mockResolvedValue([
          { statementDay: 1, dueDay: 15, payFromAccountId: 'cash' as AccountId },
        ]),
    },
  } as any;

  const loan = {
    id: 'loan' as AccountId,
    name: 'Personal Loan',
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.LOAN,
    currencyCode: 'USD',
    metadataRecords: {
      fetch: jest
        .fn()
        .mockResolvedValue([{ emiDay: 20, payFromAccountId: 'cash' as AccountId, emiAmount: 350 }]),
    },
  } as any;

  const simulate = async (overrides?: Record<string, unknown>) => {
    const input = {
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1000]]),
      plannedPayments: [],
      plannedJournals: [],
      liquidAssetIds: ['cash' as AccountId],
      liabilityAccountBalances: [],
      budgets: [],
      usages: [],
      allAccounts: [cash],
      resultCurrency: 'USD',
      workplaceId: 'test-wp' as WorkplaceId,
      simulationDays: 60,
      ...overrides,
    } as SimulationInput;

    // Mock metadata based on liabilityAccountBalances
    const metadataList = await Promise.all(
      input.liabilityAccountBalances.map(async lb => {
        const fetchRes = await (lb.account as any).metadataRecords.fetch();
        return {
          accountId: lb.account.id,
          ...fetchRes[0],
        };
      }),
    );
    (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue(metadataList);

    return cashFlowSimulationService.simulate(input);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([]);
    (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockResolvedValue({
      totalDecrease: 0,
      totalIncrease: 0,
    });
    cc.metadataRecords.fetch.mockResolvedValue([
      { statementDay: 1, dueDay: 15, payFromAccountId: 'cash' },
    ]);
    loan.metadataRecords.fetch.mockResolvedValue([{ emiDay: 20, payFromAccountId: 'cash' }]);
    (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps safe-to-spend flat when there are multiple liquid accounts and no future flows', async () => {
    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 1000],
        ['savings' as AccountId, 2500],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      allAccounts: [cash, savings],
    });

    expect(result.simulationResult.summary.safeToSpend).toBe(3500);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(3500);
    expect(result.simulationResult.projections[0].globalBalance).toBe(3500);

    expect(result.accountSummaries!.map(summary => summary.accountId).sort()).toEqual([
      'cash',
      'savings',
    ]);
  });

  it('applies fixed planned outflows and reports shortfall when cash goes negative', async () => {
    const result = await simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 100]]),
      plannedPayments: [
        {
          id: 'pp-rent' as PlannedPaymentId,
          name: 'Rent',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'landlord' as AccountId,
          amount: 300,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
    });

    expect(result.simulationResult.summary.safeToSpend).toBe(0);
    expect(result.simulationResult.summary.shortfall).toBe(500);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(-500);
    expect(result.simulationResult.projections.find(p => p.dayOffset === 34)?.globalBalance).toBe(
      -500,
    );
  });

  it('applies income, planned spending, and budget burn together without raising safe-to-spend above starting cash', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-groceries', accountId: groceries.id, account: groceries },
    ]);

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 500]]),
      plannedPayments: [
        {
          id: 'pp-salary' as PlannedPaymentId,
          name: 'Salary',
          fromAccountId: 'employer' as AccountId,
          toAccountId: 'cash' as AccountId,
          amount: 1500,
          nextOccurrence: dayjs('2026-04-03T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'pp-groceries' as PlannedPaymentId,
          name: 'Grocery pickup',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-groceries' as AccountId,
          amount: 120,
          nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-groceries' as BudgetId,
          name: 'Groceries Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, groceries],
    });

    expect(result.simulationResult.summary.firstMajorInflowDay).toBe(2);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(488, 0);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(result.allFlows!.some(flow => flow.amount === 120)).toBe(true);
  });

  it('resolves planned spending against the matching budget category by taking the larger daily amount', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining' as PlannedPaymentId,
          name: 'Dinner reservation',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 80,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-dining',
          name: 'Dining Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, dining],
    });

    const planned = result.allFlows!.find(flow => flow.origin === FlowSource.PLANNED_PAYMENT);
    expect(planned?.amount).toBe(80);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(407.33, 1);
    const budgetFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.BUDGET);
    expect(budgetFlows.length).toBeGreaterThan(0);
  });

  it('splits budget burn across multiple asset accounts while preserving global safe-to-spend', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-shared', accountId: groceries.id, account: groceries },
    ]);

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 400],
        ['savings' as AccountId, 600],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      budgets: [
        {
          id: 'b-shared' as BudgetId,
          name: 'Shared Grocery Budget',
          amount: 300,
          assetAccountIds: 'cash,savings',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, savings, groceries],
    });

    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(409.68, 0);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'cash')?.usageDetails!
        .totalOutflow,
    ).toBeCloseTo(295.16, 0);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'savings')?.usageDetails!
        .totalOutflow,
    ).toBeCloseTo(295.16, 0);
  });

  it('keeps internal liquid transfers net-zero globally while changing account-level balances', async () => {
    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 1000],
        ['savings' as AccountId, 0],
      ]),
      plannedPayments: [
        {
          id: 'pp-sweep' as PlannedPaymentId,
          name: 'Savings sweep',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'savings' as AccountId,
          amount: 250,
          nextOccurrence: dayjs('2026-04-06T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      allAccounts: [cash, savings],
    });

    const lastProjection =
      result.simulationResult.projections[result.simulationResult.projections.length - 1];
    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
    expect(lastProjection.accountBalances!.get('cash')).toBe(500);
    expect(lastProjection.accountBalances!.get('savings')).toBe(500);
  });

  it('applies explicit liability overpayments in full and does not generate an additional bill for the covered statement', async () => {
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 400]]),
    );

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-cc-overpay' as PlannedPaymentId,
          name: 'Aggressive card payment',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'cc' as AccountId,
          amount: 1000,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      liabilityAccountBalances: [{ account: cc, balance: 400 }],
      allAccounts: [cash, cc],
    });

    expect(result.simulationResult.summary.safeToSpend).toBe(0);
    expect(result.simulationResult.summary.shortfall).toBe(1000);
    expect(result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY)).toHaveLength(0);
    expect(
      result.simulationResult.projections[
        result.simulationResult.projections.length - 1
      ].accountBalances!.get('cash'),
    ).toBe(-1000);
  });

  it('uses settled credit-card payments to reduce only the remaining statement obligation', async () => {
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 500]]),
    );
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockResolvedValue({
      totalDecrease: 200,
      totalIncrease: 0,
    });

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      liabilityAccountBalances: [{ account: cc, balance: 800 }],
      allAccounts: [cash, cc],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
    expect(liabilityFlows).toHaveLength(2);
    expect(liabilityFlows[0].amount).toBe(300);
    expect(result.simulationResult.summary.safeToSpend).toBe(200);
  });

  it('models non-credit-card liabilities as a due-date cash obligation', async () => {
    (loan.metadataRecords.fetch as jest.Mock).mockResolvedValue([
      { emiDay: 20, payFromAccountId: 'cash', emiAmount: 350 },
    ]);
    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      liabilityAccountBalances: [{ account: loan, balance: 350 }],
      allAccounts: [cash, loan],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    expect(liabilityFlows[0].amount).toBe(350);
    expect(liabilityFlows[0].dayOffset).toBe(19);
    expect(result.simulationResult.summary.safeToSpend).toBe(650);
  });

  it('deduplicates a planned payment template when a generated journal exists on the same date', async () => {
    const occurrence = dayjs('2026-04-05T12:00:00Z').valueOf();

    (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([
      { journalId: 'j-rent', accountId: 'cash', transactionType: 'CREDIT', amount: 700 },
      { journalId: 'j-rent', accountId: 'exp-rent', transactionType: 'DEBIT', amount: 700 },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-rent' as PlannedPaymentId,
          name: 'Rent template',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-rent' as AccountId,
          amount: 700,
          nextOccurrence: occurrence,
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      plannedJournals: [
        {
          id: 'j-rent',
          description: 'Rent generated journal',
          journalDate: occurrence,
          plannedPaymentId: 'pp-rent',
        } as any,
      ],
      allAccounts: [cash, { id: 'exp-rent', name: 'Rent', accountType: AccountType.EXPENSE }],
    });

    const plannedFlows = result.allFlows!.filter(
      flow =>
        flow.origin === FlowSource.PLANNED_PAYMENT ||
        flow.origin === FlowSource.PLANNED_JOURNAL ||
        flow.resolution === 'MERGED',
    );

    expect(plannedFlows).toHaveLength(2);
    expect(plannedFlows[0].referenceId).toBe('j-rent');
    expect(result.simulationResult.summary.safeToSpend).toBe(0);
  });

  it('reconciles a planned spend against every category covered by a multi-category budget', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-food-shared', accountId: groceries.id, account: groceries },
      { budgetId: 'b-food-shared', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining-shared' as PlannedPaymentId,
          name: 'Shared dining spend',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 80,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-food-shared' as BudgetId,
          name: 'Food Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, groceries, dining],
    });

    const planned = result.allFlows!.find(flow => flow.origin === FlowSource.PLANNED_PAYMENT);
    expect(planned?.amount).toBe(80);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(407.33, 1);
  });

  it('reconciles multiple planned spends in different covered categories against a single budget', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-food', accountId: groceries.id, account: groceries },
      { budgetId: 'b-food', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining' as PlannedPaymentId,
          name: 'Dining spend',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 50,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'pp-groceries' as PlannedPaymentId,
          name: 'Groceries spend',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-groceries' as AccountId,
          amount: 60,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-food' as BudgetId,
          name: 'Food Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, groceries, dining],
    });

    const plannedFlows = result.allFlows!.filter(
      flow => flow.origin === FlowSource.PLANNED_PAYMENT,
    );
    expect(plannedFlows).toHaveLength(4);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(406.33, 1);
  });

  it('handles cross-currency reconciliation with proper normalization', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining', accountId: dining.id, account: dining },
    ]);
    (convertAmount as jest.Mock).mockImplementation(
      async ({ amount, fromCurrency, toCurrency }: any) => {
        if (fromCurrency === toCurrency) return { ok: true, amount };
        if (fromCurrency === 'EUR') return { ok: true, amount: amount * 1.1 };
        return { ok: true, amount };
      },
    );

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining-eur' as PlannedPaymentId,
          name: 'European Dinner',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 20, // 20 EUR -> 22 USD
          currencyCode: 'EUR',
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
        },
      ],
      budgets: [
        {
          id: 'b-dining',
          name: 'Dining Budget',
          amount: 300, // 10 USD/day
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, dining],
    });

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);

    // Resolved should be 22 USD (max of 10 USD limit vs 22 USD actual)
    expect(resolved?.amount).toBe(22);
  });

  it('supports nested category reconciliation through ancestral budget scopes', async () => {
    const food = { id: 'exp-food', name: 'Food', accountType: AccountType.EXPENSE } as any;
    const snacks = {
      id: 'exp-snacks',
      name: 'Snacks',
      accountType: AccountType.EXPENSE,
      parentAccountId: 'exp-food',
    } as any;

    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-food-parent', accountId: food.id, account: food },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-snacks' as PlannedPaymentId,
          name: 'Snack run',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-snacks' as AccountId,
          amount: 50,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-food-parent' as BudgetId,
          name: 'Food Parent Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, food, snacks],
    });

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);

    expect(resolved?.amount).toBe(50);
  });

  it('generates no flows for overspent budgets in current month but preserves future months', async () => {
    // Set time to late in the month so next month is within the 30-day window
    jest.setSystemTime(new Date('2026-04-25T00:00:00Z'));
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-overspent', accountId: groceries.id, account: groceries },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      budgets: [
        {
          id: 'b-overspent' as BudgetId,
          name: 'Overspent Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: -50 }],
      allAccounts: [cash, groceries],
    });

    const budgetFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.BUDGET);

    // On April 25, daysLeftInMonth is 6 (25, 26, 27, 28, 29, 30).
    // So currentMonthDailyRate (0) applies for dayOffset 0..5.
    // Next month flows start at dayOffset 6.
    expect(budgetFlows.every(f => f.dayOffset >= 6)).toBe(true);
    expect(budgetFlows.length).toBeGreaterThan(0);
  });

  it('resolves cleanly when planned spend is exactly equal to budget burn', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining-exact', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining-exact' as PlannedPaymentId,
          name: 'Exact Dinner',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 10, // Matches 300/30
          nextOccurrence: dayjs('2026-04-01T12:00:00Z').valueOf(),
          intervalType: 'DAILY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-dining-exact' as BudgetId,
          name: 'Exact Dining Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, dining],
    });

    const budgetFlow = result.allFlows!.find(flow => flow.origin === FlowSource.BUDGET);

    // effectiveRemaining = 300 - (30*10) = 0. No budget flows emitted.
    expect(budgetFlow).toBeUndefined();
    expect(result.simulationResult.summary.safeToSpend).toBe(400);
  });

  it('rolls future credit-card planned spending into a future liability obligation', async () => {
    // CC: Statement 1st, Due 15th.
    // Today is April 1st.
    // April 1st spending -> May 1st Statement -> May 15th Due.

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 0]]),
    );

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-cc-spending' as PlannedPaymentId,
          name: 'Credit card spending',
          fromAccountId: 'cc' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 200,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      liabilityAccountBalances: [{ account: cc, balance: 0 }],
      allAccounts: [cash, cc, dining],
      simulationDays: 60, // simulationDays must be large enough to catch the May 15th bill (44 days out)
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    // We expect an obligation on May 15th (dayOffset approx 44) for $200
    const mayBill = liabilityFlows.find(f => f.dayOffset > 40);

    expect(mayBill).toMatchObject({
      amount: 200,
      accountId: 'cash',
    });

    // Safe to spend should consider this future obligation
    // 1000 - 200 = 800
    expect(result.simulationResult.summary.safeToSpend).toBe(800);
  });
});
