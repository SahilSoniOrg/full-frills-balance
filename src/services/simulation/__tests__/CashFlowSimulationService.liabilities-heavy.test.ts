import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { convertAmount } from '@/src/services/currencyConversion';
import {
  cashFlowSimulationService,
  SimulationInput,
} from '@/src/services/simulation/CashFlowSimulationService';
import { FlowSource } from '@/src/services/simulation/types';
import { AccountId, WorkplaceId } from '@/src/types/domain';

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
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/src/services/currencyConversion', () => ({
  convertAmount: jest.fn(async ({ amount, fromCurrency, toCurrency }: any) => ({
    ok: true,
    amount: fromCurrency === toCurrency ? amount : amount,
  })),
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    metric: jest.fn(),
  },
}));

describe('CashFlowSimulationService liability-heavy coverage', () => {
  const makeAsset = (id: string, name = id, currencyCode = 'USD') =>
    ({
      id: id as AccountId,
      name,
      accountType: AccountType.ASSET,
      accountSubtype: 'CHECKING',
      currencyCode,
    }) as any;

  const makeCreditCard = (
    id: string,
    options?: {
      name?: string;
      statementDay?: number;
      dueDay?: number;
      payFromAccountId?: string;
      currencyCode?: string;
    },
  ) =>
    ({
      id: id as AccountId,
      name: options?.name || id,
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: options?.currencyCode || 'USD',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([
          {
            statementDay: options?.statementDay ?? 1,
            dueDay: options?.dueDay ?? 15,
            payFromAccountId: (options?.payFromAccountId ?? 'cash') as AccountId,
          },
        ]),
      },
    }) as any;

  const makeLoan = (
    id: string,
    options?: {
      name?: string;
      emiDay?: number;
      payFromAccountId?: string;
      currencyCode?: string;
      emiAmount?: number;
    },
  ) =>
    ({
      id: id as AccountId,
      name: options?.name || id,
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.LOAN,
      currencyCode: options?.currencyCode || 'USD',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([
          {
            emiDay: options?.emiDay ?? 20,
            payFromAccountId: (options?.payFromAccountId ?? 'cash') as AccountId,
            emiAmount: (options as any)?.emiAmount ?? 100,
          },
        ]),
      },
    }) as any;

  const simulate = async (overrides?: Record<string, unknown>) => {
    const cash = makeAsset('cash', 'Checking');
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
    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue(metadataList);

    return cashFlowSimulationService.simulate(input);
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
    (convertAmount as jest.Mock).mockImplementation(
      async ({ amount, fromCurrency, toCurrency }: any) => ({
        ok: true,
        amount: fromCurrency === toCurrency ? amount : amount,
      }),
    );
    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('routes multiple liability obligations to the configured liquid accounts with exact remaining-statement math', async () => {
    const cash = makeAsset('cash', 'Checking');
    const savings = makeAsset('savings', 'Savings');
    const ccPrimary = makeCreditCard('cc-primary', {
      name: 'Primary Card',
      dueDay: 15,
      payFromAccountId: 'cash',
    });
    const ccBackup = makeCreditCard('cc-backup', {
      name: 'Backup Card',
      dueDay: 10,
      payFromAccountId: 'savings',
    });
    const loan = makeLoan('loan-car', {
      name: 'Car Loan',
      emiDay: 20,
      payFromAccountId: 'cash',
      emiAmount: 600,
    });

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockImplementation(
      (_wp: WorkplaceId, ids: string[]) => {
        const id = ids[0];
        return Promise.resolve(new Map([[id, id === 'cc-primary' ? 500 : 300]]));
      },
    );
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockImplementation(
      (_wp: WorkplaceId, accountId: string) =>
        Promise.resolve({
          totalDecrease: accountId === 'cc-primary' ? 100 : accountId === 'cc-backup' ? 50 : 0,
          totalIncrease: 0,
        }),
    );

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 1500],
        ['savings' as AccountId, 800],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      liabilityAccountBalances: [
        { account: ccPrimary, balance: 800 },
        { account: ccBackup, balance: 300 },
        { account: loan, balance: 600 },
      ],
      allAccounts: [cash, savings, ccPrimary, ccBackup, loan],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
    expect(liabilityFlows).toHaveLength(5);
    expect(liabilityFlows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 'savings', amount: 250, dayOffset: 9 }),
        expect.objectContaining({ accountId: 'cash', amount: 400, dayOffset: 14 }),
        expect.objectContaining({ accountId: 'cash', amount: 600, dayOffset: 19 }),
      ]),
    );
    expect(result.simulationResult.summary.safeToSpend).toBe(600);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'cash')?.usageDetails!
        .totalOutflow,
    ).toBe(1400);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'savings')?.usageDetails!
        .totalOutflow,
    ).toBe(300);
  });

  it('reports a coherent shortfall when stacked liabilities exceed liquid balances', async () => {
    const cash = makeAsset('cash', 'Checking');
    const savings = makeAsset('savings', 'Savings');
    const cc = makeCreditCard('cc', { name: 'Card', dueDay: 15, payFromAccountId: 'cash' });
    const loan = makeLoan('loan-a', {
      name: 'Loan A',
      emiDay: 10,
      payFromAccountId: 'cash',
      emiAmount: 400,
    });

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 250]]),
    );

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 300],
        ['savings' as AccountId, 100],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      liabilityAccountBalances: [
        { account: cc, balance: 250 },
        { account: loan, balance: 400 },
      ],
      allAccounts: [cash, savings, cc, loan],
    });

    expect(result.simulationResult.summary.safeToSpend).toBe(0);
    expect(result.simulationResult.summary.shortfall).toBe(250);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(-250);
    expect(
      result.simulationResult.projections[
        result.simulationResult.projections.length - 1
      ].accountBalances!.get('cash'),
    ).toBe(-350);
  });

  it('skips liabilities whose configured pay-from account is outside the tracked liquid set', async () => {
    const cash = makeAsset('cash', 'Checking');
    const externalCard = makeCreditCard('cc-external', {
      name: 'External Card',
      dueDay: 12,
      payFromAccountId: 'brokerage',
    });
    const trackedLoan = makeLoan('loan-tracked', {
      name: 'Tracked Loan',
      emiDay: 20,
      payFromAccountId: 'cash',
      emiAmount: 200,
    });

    const result = await simulate({
      startingBalances: new Map([['cash', 1000]]),
      liabilityAccountBalances: [
        { account: externalCard, balance: 500 },
        { account: trackedLoan, balance: 200 },
      ],
      allAccounts: [cash, externalCard, trackedLoan],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    expect(liabilityFlows).toHaveLength(1);
    expect(liabilityFlows[0]).toEqual(
      expect.objectContaining({
        accountId: 'cash',
        amount: 200,
        dayOffset: 19,
      }),
    );
    expect(result.simulationResult.summary.safeToSpend).toBe(800);
  });

  it('normalizes mixed-currency liquid balances and non-credit liabilities into the result currency', async () => {
    const cash = makeAsset('cash', 'Checking', 'USD');
    const euroSavings = makeAsset('eur-savings', 'Euro Savings', 'EUR');
    const euroLoan = makeLoan('eur-loan', {
      name: 'Euro Loan',
      emiDay: 10,
      payFromAccountId: 'cash',
      currencyCode: 'EUR',
      emiAmount: 50,
    });

    (convertAmount as jest.Mock).mockImplementation(
      async ({ amount, fromCurrency, toCurrency }: any) => {
        if (fromCurrency === toCurrency) return { ok: true, amount };
        if (fromCurrency === 'EUR' && toCurrency === 'USD') {
          return { ok: true, amount: amount * 2 };
        }
        return { ok: true, amount };
      },
    );

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 1000],
        ['eur-savings' as AccountId, 100],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'eur-savings' as AccountId],
      liabilityAccountBalances: [{ account: euroLoan, balance: 50 }],
      allAccounts: [cash, euroSavings, euroLoan],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    expect(liabilityFlows).toHaveLength(1);
    expect(liabilityFlows[0]).toEqual(
      expect.objectContaining({
        accountId: 'cash',
        amount: 100,
        dayOffset: 9,
      }),
    );
    expect(result.simulationResult.summary.safeToSpend).toBe(1100);
    expect(result.simulationResult.summary.shortfall).toBe(0);
  });

  it('handles a larger liability portfolio while preserving flow and projection invariants', async () => {
    const liquidAccounts = [
      makeAsset('cash', 'Checking'),
      makeAsset('savings', 'Savings'),
      makeAsset('wallet', 'Wallet'),
    ];
    const creditCards = Array.from({ length: 6 }, (_, index) =>
      makeCreditCard(`cc-${index}`, {
        name: `Card ${index}`,
        dueDay: 6 + index * 2,
        payFromAccountId: index % 2 === 0 ? 'cash' : 'savings',
      }),
    );
    const loans = Array.from({ length: 4 }, (_, index) =>
      makeLoan(`loan-${index}`, {
        name: `Loan ${index}`,
        emiDay: 12 + index * 3,
        payFromAccountId: index % 2 === 0 ? 'cash' : 'savings',
        emiAmount: 100,
      }),
    );
    const allAccounts = [...liquidAccounts, ...creditCards, ...loans];

    const statementBalances = new Map<string, number>();
    const settledAmounts = new Map<string, number>();
    creditCards.forEach((card, index) => {
      statementBalances.set(card.id, 300 + index * 40);
      settledAmounts.set(card.id, index * 10);
    });

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockImplementation(
      (_wp: WorkplaceId, ids: string[]) => {
        const id = ids[0];
        return Promise.resolve(new Map([[id, statementBalances.get(id) || 0]]));
      },
    );
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockImplementation(
      (_wp: WorkplaceId, accountId: string) =>
        Promise.resolve({
          totalDecrease: settledAmounts.get(accountId) || 0,
          totalIncrease: 0,
        }),
    );

    const liabilityBalances = [
      ...creditCards.map((card, index) => ({ account: card, balance: 500 + index * 60 })),
      ...loans.map((loan, index) => ({ account: loan, balance: 250 + index * 80 })),
    ];

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 5000],
        ['savings' as AccountId, 3200],
        ['wallet' as AccountId, 150],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId, 'wallet' as AccountId],
      liabilityAccountBalances: liabilityBalances,
      allAccounts: allAccounts,
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
    expect(liabilityFlows).toHaveLength(20);
    expect(result.simulationResult.projections).toHaveLength(60);
    expect(result.simulationResult.summary.safeToSpend).toBeGreaterThanOrEqual(0);
    expect(result.simulationResult.summary.safeToSpend).toBeLessThanOrEqual(8350);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBeLessThanOrEqual(8350);

    for (const flow of liabilityFlows) {
      expect(flow.amount).toBeGreaterThan(0);
      expect(flow.dayOffset).toBeGreaterThanOrEqual(0);
      expect(flow.dayOffset).toBeLessThan(60);
      expect(['cash', 'savings']).toContain((flow as any).accountId);
    }
  });

  it('applies explicit liability payments only to the liability they target', async () => {
    const cash = makeAsset('cash', 'Checking');
    const cardA = makeCreditCard('cc-a', {
      name: 'Card A',
      statementDay: 1,
      dueDay: 15,
      payFromAccountId: 'cash',
    });
    const cardB = makeCreditCard('cc-b', {
      name: 'Card B',
      statementDay: 1,
      dueDay: 15,
      payFromAccountId: 'cash',
    });

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockImplementation(
      (_wp: WorkplaceId, ids: string[]) => Promise.resolve(new Map([[ids[0], 400]])),
    );

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-card-a',
          name: 'Card A payment',
          fromAccountId: 'cash',
          toAccountId: 'cc-a',
          amount: 250,
          nextOccurrence: new Date('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      liabilityAccountBalances: [
        { account: cardA, balance: 400 },
        { account: cardB, balance: 400 },
      ],
      allAccounts: [cash, cardA, cardB],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    expect(liabilityFlows).toHaveLength(2);
    expect(liabilityFlows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceId: 'cc-a',
          amount: 150,
        }),
        expect.objectContaining({
          referenceId: 'cc-b',
          amount: 400,
        }),
      ]),
    );
    expect(result.simulationResult.summary.safeToSpend).toBe(0);
  });

  it.skip('TODO: converts statement balances for foreign-currency credit cards before obligation math', async () => {
    // Desired behavior:
    // For a EUR card simulated in USD, both current balance and statement balance should be normalized
    // before remaining-statement comparison. Today only the settled amount is converted.
  });
});
