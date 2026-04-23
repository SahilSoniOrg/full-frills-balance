import { AppConfig } from '@/src/constants/app-config';
import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
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

jest.mock('@/src/data/repositories/TransactionRepository', () => ({
  transactionRepository: {
    findByJournals: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/data/repositories/AccountRepository', () => ({
  accountRepository: {
    findMetadataByAccountIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn().mockImplementation(amount => Promise.resolve({ convertedAmount: amount })),
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
    getRateSafe: jest.fn().mockReturnValue(1),
  },
}));

describe('CashFlowSimulationService scenario coverage', () => {
  const cash = {
    id: 'cash',
    name: 'Checking',
    accountType: AccountType.ASSET,
    accountSubtype: 'CHECKING',
    currencyCode: 'USD',
  } as any;

  const savings = {
    id: 'savings',
    name: 'Savings',
    accountType: AccountType.ASSET,
    accountSubtype: 'SAVINGS',
    currencyCode: 'USD',
  } as any;

  const groceries = {
    id: 'exp-groceries',
    name: 'Groceries',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  } as any;

  const dining = {
    id: 'exp-dining',
    name: 'Dining',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  } as any;

  const cc = {
    id: 'cc',
    name: 'Credit Card',
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.CREDIT_CARD,
    currencyCode: 'USD',
    metadataRecords: {
      fetch: jest
        .fn()
        .mockResolvedValue([{ statementDay: 1, dueDay: 15, payFromAccountId: 'cash' }]),
    },
  } as any;

  const loan = {
    id: 'loan',
    name: 'Personal Loan',
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.LOAN,
    currencyCode: 'USD',
    metadataRecords: {
      fetch: jest
        .fn()
        .mockResolvedValue([{ emiDay: 20, payFromAccountId: 'cash', emiAmount: 350 }]),
    },
  } as any;

  const simulate = async (
    overrides?: Partial<Parameters<typeof cashFlowSimulationService.simulate>>,
  ) => {
    const args: Parameters<typeof cashFlowSimulationService.simulate> = [
      new Map([['cash', 1000]]),
      [],
      [],
      ['cash'],
      [],
      [],
      [],
      [cash],
      'USD',
    ];

    for (const [index, value] of Object.entries(overrides ?? {})) {
      args[Number(index)] = value as never;
    }

    // Mock metadata based on liabilityAccountBalances (args[4])
    const lbs = args[4] as { account: any; balance: number }[];
    const metadataList = await Promise.all(
      lbs.map(async lb => {
        const fetchRes = await lb.account.metadataRecords.fetch();
        return {
          accountId: lb.account.id,
          ...fetchRes[0],
        };
      }),
    );
    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue(metadataList);

    return cashFlowSimulationService.simulate(...args);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([]);
    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockResolvedValue({
      totalDecrease: 0,
      totalIncrease: 0,
    });
    cc.metadataRecords.fetch.mockResolvedValue([
      { statementDay: 1, dueDay: 15, payFromAccountId: 'cash' },
    ]);
    loan.metadataRecords.fetch.mockResolvedValue([{ emiDay: 20, payFromAccountId: 'cash' }]);
    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps safe-to-spend flat when there are multiple liquid accounts and no future flows', async () => {
    const result = await simulate({
      0: new Map([
        ['cash', 1000],
        ['savings', 2500],
      ]),
      3: ['cash', 'savings'],
      7: [cash, savings],
    } as any);

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
      0: new Map([['cash', 100]]),
      1: [
        {
          id: 'pp-rent',
          name: 'Rent',
          fromAccountId: 'cash',
          toAccountId: 'landlord',
          amount: 300,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
    } as any);

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
      0: new Map([['cash', 500]]),
      1: [
        {
          id: 'pp-salary',
          name: 'Salary',
          fromAccountId: 'employer',
          toAccountId: 'cash',
          amount: 1500,
          nextOccurrence: dayjs('2026-04-03T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'pp-groceries',
          name: 'Grocery pickup',
          fromAccountId: 'cash',
          toAccountId: 'exp-groceries',
          amount: 120,
          nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      5: [
        {
          id: 'b-groceries',
          name: 'Groceries Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, groceries],
    } as any);

    expect(result.simulationResult.summary.firstMajorInflowDay).toBe(2);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(488.19, 1);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(
      result.allFlows!.some(flow => flow.resolvedFrom !== undefined && flow.amount === 120),
    ).toBe(true);
  });

  it('resolves planned spending against the matching budget category by taking the larger daily amount', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-dining',
          name: 'Dinner reservation',
          fromAccountId: 'cash',
          toAccountId: 'exp-dining',
          amount: 80,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      5: [
        {
          id: 'b-dining',
          name: 'Dining Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, dining],
    } as any);

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);
    expect(resolved?.amount).toBe(80);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(421.53, 1);
    const budgetFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.BUDGET);
    expect(budgetFlows).toHaveLength(58);
  });

  it('splits budget burn across multiple asset accounts while preserving global safe-to-spend', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-shared', accountId: groceries.id, account: groceries },
    ]);

    const result = await simulate({
      0: new Map([
        ['cash', 400],
        ['savings', 600],
      ]),
      3: ['cash', 'savings'],
      5: [
        {
          id: 'b-shared',
          name: 'Shared Grocery Budget',
          amount: 300,
          assetAccountIds: 'cash,savings',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, savings, groceries],
    } as any);

    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(409.68, 1);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'cash')?.usageDetails!
        .totalOutflow,
    ).toBeCloseTo(295.16, 1);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'savings')?.usageDetails!
        .totalOutflow,
    ).toBeCloseTo(295.16, 1);
  });

  it('keeps internal liquid transfers net-zero globally while changing account-level balances', async () => {
    const result = await simulate({
      0: new Map([
        ['cash', 1000],
        ['savings', 0],
      ]),
      1: [
        {
          id: 'pp-sweep',
          name: 'Savings sweep',
          fromAccountId: 'cash',
          toAccountId: 'savings',
          amount: 250,
          nextOccurrence: dayjs('2026-04-06T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      3: ['cash', 'savings'],
      7: [cash, savings],
    } as any);

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
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-cc-overpay',
          name: 'Aggressive card payment',
          fromAccountId: 'cash',
          toAccountId: 'cc',
          amount: 1000,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      4: [{ account: cc, balance: 400 }],
      7: [cash, cc],
    } as any);

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
      0: new Map([['cash', 1000]]),
      4: [{ account: cc, balance: 800 }],
      7: [cash, cc],
    } as any);

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
      0: new Map([['cash', 1000]]),
      4: [{ account: loan, balance: 350 }],
      7: [cash, loan],
    } as any);

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    expect(liabilityFlows[0].amount).toBe(350);
    expect(liabilityFlows[0].dayOffset).toBe(19);
    expect(result.simulationResult.summary.safeToSpend).toBe(650);
  });

  it('deduplicates a planned payment template when a generated journal exists on the same date', async () => {
    const occurrence = dayjs('2026-04-05T12:00:00Z').valueOf();

    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([
      { journalId: 'j-rent', accountId: 'cash', transactionType: 'CREDIT', amount: 700 },
      { journalId: 'j-rent', accountId: 'exp-rent', transactionType: 'DEBIT', amount: 700 },
    ]);

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-rent',
          name: 'Rent template',
          fromAccountId: 'cash',
          toAccountId: 'exp-rent',
          amount: 700,
          nextOccurrence: occurrence,
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      2: [
        {
          id: 'j-rent',
          description: 'Rent generated journal',
          journalDate: occurrence,
          plannedPaymentId: 'pp-rent',
        } as any,
      ],
      7: [cash, { id: 'exp-rent', name: 'Rent', accountType: AccountType.EXPENSE }],
    } as any);

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
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-dining-shared',
          name: 'Shared dining spend',
          fromAccountId: 'cash',
          toAccountId: 'exp-dining',
          amount: 80,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      5: [
        {
          id: 'b-food-shared',
          name: 'Food Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, groceries, dining],
    } as any);

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);
    expect(resolved?.amount).toBe(80);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(421.53, 1);
  });

  it('reconciles multiple planned spends in different covered categories against a single budget', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-food', accountId: groceries.id, account: groceries },
      { budgetId: 'b-food', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-dining',
          name: 'Dining spend',
          fromAccountId: 'cash',
          toAccountId: 'exp-dining',
          amount: 50,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'pp-groceries',
          name: 'Groceries spend',
          fromAccountId: 'cash',
          toAccountId: 'exp-groceries',
          amount: 60,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      5: [
        {
          id: 'b-food',
          name: 'Food Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, groceries, dining],
    } as any);

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);

    expect(resolved?.amount).toBe(110);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(418.59, 1); // 1000 - (29 * 6.33) - 110 = ~706.33
  });

  it('handles cross-currency reconciliation with proper normalization', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining', accountId: dining.id, account: dining },
    ]);
    (exchangeRateService.convert as jest.Mock).mockImplementation((amount, from) => {
      if (from === 'EUR') return Promise.resolve({ convertedAmount: amount * 1.1 });
      return Promise.resolve({ convertedAmount: amount });
    });
    (exchangeRateService.getRateSafe as jest.Mock).mockImplementation((from: string) => {
      if (from === 'EUR') return 1.1;
      return 1;
    });

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-dining-eur',
          name: 'European Dinner',
          fromAccountId: 'cash',
          toAccountId: 'exp-dining',
          amount: 20, // 20 EUR -> 22 USD
          currencyCode: 'EUR',
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
        },
      ],
      5: [
        {
          id: 'b-dining',
          name: 'Dining Budget',
          amount: 300, // 10 USD/day
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, dining],
    } as any);

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
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-snacks',
          name: 'Snack run',
          fromAccountId: 'cash',
          toAccountId: 'exp-snacks',
          amount: 50,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      5: [
        {
          id: 'b-food-parent',
          name: 'Food Parent Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, food, snacks],
    } as any);

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);

    expect(resolved?.amount).toBe(50);
  });

  it('generates no flows for overspent budgets in current month but preserves future months', async () => {
    const originalMode = AppConfig.defaults.budgetMode;
    (AppConfig.defaults as any).budgetMode = 'ACTUAL';

    try {
      // Set time to late in the month so next month is within the 30-day window
      jest.setSystemTime(new Date('2026-04-25T00:00:00Z'));
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-overspent', accountId: groceries.id, account: groceries },
      ]);

      const result = await simulate({
        0: new Map([['cash', 1000]]),
        5: [
          {
            id: 'b-overspent',
            name: 'Overspent Budget',
            amount: 300,
            assetAccountIds: 'cash',
            currencyCode: 'USD',
          },
        ],
        6: [{ remaining: -50 }],
        7: [cash, groceries],
      } as any);

      const budgetFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.BUDGET);

      // On April 25, daysLeftInMonth is 6 (25, 26, 27, 28, 29, 30).
      // So currentMonthDailyRate (0) applies for dayOffset 0..5.
      // Next month flows start at dayOffset 6.
      expect(budgetFlows.every(f => f.dayOffset >= 6)).toBe(true);
      expect(budgetFlows.length).toBeGreaterThan(0);
    } finally {
      (AppConfig.defaults as any).budgetMode = originalMode;
    }
  });

  it('resolves cleanly when planned spend is exactly equal to budget burn', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining-exact', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-dining-exact',
          name: 'Exact Dinner',
          fromAccountId: 'cash',
          toAccountId: 'exp-dining',
          amount: 10, // Matches 300/30
          nextOccurrence: dayjs('2026-04-01T12:00:00Z').valueOf(),
          intervalType: 'DAILY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      5: [
        {
          id: 'b-dining-exact',
          name: 'Dining Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      6: [{ remaining: 300 }],
      7: [cash, dining],
    } as any);

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);

    // effectiveRemaining = 300 - (30*10) = 0. No budget flows emitted.
    expect(resolved).toBeUndefined();
    expect(result.simulationResult.summary.safeToSpend).toBe(400);
  });

  it('reconciles correctly in SMOOTHED budget burn mode', async () => {
    const originalMode = AppConfig.defaults.budgetMode;
    (AppConfig.defaults as any).budgetMode = 'SMOOTHED';

    try {
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-smoothed', accountId: groceries.id, account: groceries },
      ]);

      const result = await simulate({
        0: new Map([['cash', 1000]]),
        1: [
          {
            id: 'pp-groceries',
            name: 'Groceries',
            fromAccountId: 'cash',
            toAccountId: 'exp-groceries',
            amount: 50,
            nextOccurrence: dayjs('2026-04-15T12:00:00Z').valueOf(),
            intervalType: 'MONTHLY',
            intervalN: 1,
            currencyCode: 'USD',
          },
        ],
        5: [
          {
            id: 'b-smoothed',
            name: 'Smoothed Budget',
            amount: 300,
            assetAccountIds: 'cash',
            currencyCode: 'USD',
          },
        ],
        6: [{ remaining: 150 }], // 150 left in April
        7: [cash, groceries],
      } as any);

      // Simulation window is 60 days.
      // Smoothed Daily = (Remaining + Next Month Budget) / 60
      // = (150 + 300) / 60 = 450 / 60 = 7.5 per day.
      // Planned spend 50 > 7.5, so resolved should be 50.
      expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(569.46, 1);
    } finally {
      (AppConfig.defaults as any).budgetMode = originalMode;
    }
  });

  it('rolls future credit-card planned spending into a future liability obligation', async () => {
    // CC: Statement 1st, Due 15th.
    // Today is April 1st.
    // April 1st spending -> May 1st Statement -> May 15th Due.

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 0]]),
    );

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      1: [
        {
          id: 'pp-cc-spending',
          name: 'Credit card spending',
          fromAccountId: 'cc',
          toAccountId: 'exp-dining',
          amount: 200,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      4: [{ account: cc, balance: 0 }],
      7: [cash, cc, dining],
      9: 60, // simulationDays must be large enough to catch the May 15th bill (44 days out)
    } as any);

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
