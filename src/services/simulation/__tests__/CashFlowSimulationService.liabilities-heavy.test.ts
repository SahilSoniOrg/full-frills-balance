import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { FlowSource } from '@/src/services/simulation/types';

jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    getScopes: jest.fn().mockResolvedValue([]),
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

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn().mockImplementation(amount => Promise.resolve({ convertedAmount: amount })),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CashFlowSimulationService liability-heavy coverage', () => {
  const makeAsset = (id: string, name = id, currencyCode = 'USD') =>
    ({
      id,
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
      id,
      name: options?.name || id,
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: options?.currencyCode || 'USD',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([
          {
            statementDay: options?.statementDay ?? 1,
            dueDay: options?.dueDay ?? 15,
            payFromAccountId: options?.payFromAccountId ?? 'cash',
          },
        ]),
      },
    }) as any;

  const makeLoan = (
    id: string,
    options?: { name?: string; emiDay?: number; payFromAccountId?: string; currencyCode?: string },
  ) =>
    ({
      id,
      name: options?.name || id,
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.LOAN,
      currencyCode: options?.currencyCode || 'USD',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([
          {
            emiDay: options?.emiDay ?? 20,
            payFromAccountId: options?.payFromAccountId ?? 'cash',
          },
        ]),
      },
    }) as any;

  const simulate = (overrides?: Partial<Parameters<typeof cashFlowSimulationService.simulate>>) => {
    const cash = makeAsset('cash', 'Checking');
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

    return cashFlowSimulationService.simulate(...args);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    (budgetRepository.getScopes as jest.Mock).mockResolvedValue([]);
    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockResolvedValue({
      totalDecrease: 0,
      totalIncrease: 0,
    });
    (exchangeRateService.convert as jest.Mock).mockImplementation((amount: number) =>
      Promise.resolve({ convertedAmount: amount }),
    );
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
    const loan = makeLoan('loan-car', { name: 'Car Loan', emiDay: 20, payFromAccountId: 'cash' });

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockImplementation(
      (ids: string[]) => {
        const id = ids[0];
        return Promise.resolve(new Map([[id, id === 'cc-primary' ? 500 : 300]]));
      },
    );
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockImplementation(
      (accountId: string) =>
        Promise.resolve({
          totalDecrease: accountId === 'cc-primary' ? 100 : accountId === 'cc-backup' ? 50 : 0,
          totalIncrease: 0,
        }),
    );

    const result = await simulate({
      0: new Map([
        ['cash', 1500],
        ['savings', 800],
      ]),
      3: ['cash', 'savings'],
      4: [
        { account: ccPrimary, balance: 800 },
        { account: ccBackup, balance: 300 },
        { account: loan, balance: 600 },
      ],
      7: [cash, savings, ccPrimary, ccBackup, loan],
    } as any);

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
    expect(liabilityFlows).toHaveLength(3);
    expect(liabilityFlows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 'savings', amount: 250, dayOffset: 9 }),
        expect.objectContaining({ accountId: 'cash', amount: 400, dayOffset: 14 }),
        expect.objectContaining({ accountId: 'cash', amount: 600, dayOffset: 19 }),
      ]),
    );
    expect(result.simulationResult.summary.safeToSpend).toBe(1050);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'cash')?.usageDetails!
        .totalOutflow,
    ).toBe(1000);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'savings')?.usageDetails!
        .totalOutflow,
    ).toBe(250);
  });

  it('reports a coherent shortfall when stacked liabilities exceed liquid balances', async () => {
    const cash = makeAsset('cash', 'Checking');
    const savings = makeAsset('savings', 'Savings');
    const cc = makeCreditCard('cc', { name: 'Card', dueDay: 15, payFromAccountId: 'cash' });
    const loan = makeLoan('loan', { name: 'Loan', emiDay: 20, payFromAccountId: 'cash' });

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 250]]),
    );

    const result = await simulate({
      0: new Map([
        ['cash', 300],
        ['savings', 100],
      ]),
      3: ['cash', 'savings'],
      4: [
        { account: cc, balance: 250 },
        { account: loan, balance: 400 },
      ],
      7: [cash, savings, cc, loan],
    } as any);

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
    });

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      4: [
        { account: externalCard, balance: 500 },
        { account: trackedLoan, balance: 200 },
      ],
      7: [cash, externalCard, trackedLoan],
    } as any);

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
    });

    (exchangeRateService.convert as jest.Mock).mockImplementation(
      (amount: number, from: string, to: string) => {
        if (from === to) return Promise.resolve({ convertedAmount: amount });
        if (from === 'EUR' && to === 'USD') return Promise.resolve({ convertedAmount: amount * 2 });
        return Promise.resolve({ convertedAmount: amount });
      },
    );

    const result = await simulate({
      0: new Map([
        ['cash', 1000],
        ['eur-savings', 100],
      ]),
      3: ['cash', 'eur-savings'],
      4: [{ account: euroLoan, balance: 50 }],
      7: [cash, euroSavings, euroLoan],
    } as any);

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
      (ids: string[]) => {
        const id = ids[0];
        return Promise.resolve(new Map([[id, statementBalances.get(id) || 0]]));
      },
    );
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockImplementation(
      (accountId: string) =>
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
      0: new Map([
        ['cash', 5000],
        ['savings', 3200],
        ['wallet', 150],
      ]),
      3: ['cash', 'savings', 'wallet'],
      4: liabilityBalances,
      7: allAccounts,
    } as any);

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
    expect(liabilityFlows).toHaveLength(liabilityBalances.length);
    expect(result.simulationResult.projections).toHaveLength(30);
    expect(result.simulationResult.summary.safeToSpend).toBeGreaterThanOrEqual(0);
    expect(result.simulationResult.summary.safeToSpend).toBeLessThanOrEqual(8350);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBeLessThanOrEqual(8350);

    for (const flow of liabilityFlows) {
      expect(flow.amount).toBeGreaterThan(0);
      expect(flow.dayOffset).toBeGreaterThanOrEqual(0);
      expect(flow.dayOffset).toBeLessThan(30);
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
      (ids: string[]) => Promise.resolve(new Map([[ids[0], 400]])),
    );

    const result = await simulate({
      0: new Map([['cash', 1000]]),
      1: [
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
      4: [
        { account: cardA, balance: 400 },
        { account: cardB, balance: 400 },
      ],
      7: [cash, cardA, cardB],
    } as any);

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
    expect(result.simulationResult.summary.safeToSpend).toBe(200);
  });

  it.skip('TODO: converts statement balances for foreign-currency credit cards before obligation math', async () => {
    // Desired behavior:
    // For a EUR card simulated in USD, both current balance and statement balance should be normalized
    // before remaining-statement comparison. Today only the settled amount is converted.
  });
});
