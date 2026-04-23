import { AppConfig } from '@/src/constants/app-config';
import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
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

describe('CashFlowSimulationService heavy scenario coverage', () => {
  const start = dayjs('2026-04-01T00:00:00Z');
  const atDay = (dayOffset: number) => start.add(dayOffset, 'day').hour(12).valueOf();

  const makeAsset = (id: string, name = id) =>
    ({
      id,
      name,
      accountType: AccountType.ASSET,
      accountSubtype: 'CHECKING',
      currencyCode: 'USD',
    }) as any;

  const makeExpense = (id: string, name = id) =>
    ({
      id,
      name,
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    }) as any;

  const makeCreditCard = (id: string, name = id, dueDay = 15) =>
    ({
      id,
      name,
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'USD',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay, payFromAccountId: 'cash' }]),
      },
    }) as any;

  const makeLoan = (id: string, name = id, emiDay = 20) =>
    ({
      id,
      name,
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.LOAN,
      currencyCode: 'USD',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([{ emiDay, payFromAccountId: 'cash', emiAmount: 600 }]),
      },
    }) as any;

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
    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.only('handles a dense mixed portfolio and preserves simulation invariants', async () => {
    const liquidAccounts = [
      makeAsset('cash', 'Checking'),
      makeAsset('savings', 'Savings'),
      makeAsset('wallet', 'Wallet'),
    ];
    const expenseAccounts = Array.from({ length: 8 }, (_, index) =>
      makeExpense(`exp-${index}`, `Expense ${index}`),
    );
    const creditCards = [
      makeCreditCard('cc-1', 'Travel Card', 15),
      makeCreditCard('cc-2', 'Backup Card', 25),
    ];
    const loan = makeLoan('loan-1', 'Personal Loan', 20);
    const allAccounts = [...liquidAccounts, ...expenseAccounts, ...creditCards, loan];

    const budgets = expenseAccounts.map(
      (_, index) =>
        ({
          id: `budget-${index}`,
          name: `Budget ${index}`,
          amount: 150 + index * 25,
          assetAccountIds: index % 2 === 0 ? 'cash,savings' : 'cash',
          currencyCode: 'USD',
        }) as any,
    );
    const usages = budgets.map(budget => ({ remaining: budget.amount }) as any);
    const allScopes = budgets.flatMap((budget, index) => [
      {
        budgetId: budget.id,
        accountId: expenseAccounts[index].id,
        account: expenseAccounts[index],
      },
    ]);
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue(allScopes);

    const plannedPayments = [
      {
        id: 'salary',
        name: 'Salary',
        fromAccountId: 'external-income',
        toAccountId: 'cash',
        amount: 4000,
        nextOccurrence: atDay(9),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      {
        id: 'transfer-savings',
        name: 'Savings transfer',
        fromAccountId: 'cash',
        toAccountId: 'savings',
        amount: 700,
        nextOccurrence: atDay(4),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      {
        id: 'transfer-wallet',
        name: 'Wallet top-up',
        fromAccountId: 'cash',
        toAccountId: 'wallet',
        amount: 120,
        nextOccurrence: atDay(6),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      {
        id: 'cc-payment-1',
        name: 'Travel Card Payment',
        fromAccountId: 'cash',
        toAccountId: 'cc-1',
        amount: 250,
        nextOccurrence: atDay(5),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      {
        id: 'cc-payment-2',
        name: 'Backup Card Payment',
        fromAccountId: 'savings',
        toAccountId: 'cc-2',
        amount: 100,
        nextOccurrence: atDay(15),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      ...expenseAccounts.map((expense, index) => ({
        id: `planned-expense-${index}`,
        name: `Planned Expense ${index}`,
        fromAccountId: index % 3 === 0 ? 'savings' : 'cash',
        toAccountId: expense.id,
        amount: 40 + index * 10,
        nextOccurrence: atDay(2 + index * 3),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      })),
    ] as any[];

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([
        ['cc-1', 600],
        ['cc-2', 300],
      ]),
    );
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockImplementation(
      (accountId: string) =>
        Promise.resolve({
          totalDecrease: accountId === 'cc-1' ? 100 : 0,
          totalIncrease: 0,
        }),
    );

    // Mock metadata for batch fetch
    const liabilityAccountBalances = [
      { account: creditCards[0], balance: 900 },
      { account: creditCards[1], balance: 300 },
      { account: loan, balance: 500 },
    ];
    const metadataList = await Promise.all(
      liabilityAccountBalances.map(async lb => ({
        accountId: lb.account.id,
        ...(await lb.account.metadataRecords.fetch())[0],
      })),
    );
    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue(metadataList);

    const result = await cashFlowSimulationService.simulate(
      new Map([
        ['cash', 2500],
        ['savings', 1200],
        ['wallet', 300],
      ]),
      plannedPayments,
      [],
      ['cash', 'savings', 'wallet'],
      liabilityAccountBalances,
      budgets,
      usages,
      allAccounts,
      'USD',
    );

    expect(result.simulationResult.projections).toHaveLength(AppConfig.defaults.safeToSpendDays);
    expect(result.allFlows!.length).toBeGreaterThan(250);
    expect(result.accountSummaries!.length).toBe(3);
    expect(result.simulationResult.summary.firstMajorInflowDay).toBe(9);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(result.simulationResult.summary.safeToSpend).toBeGreaterThan(0);
    expect(result.simulationResult.summary.safeToSpend).toBeLessThanOrEqual(4000);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBeGreaterThanOrEqual(
      result.simulationResult.summary.safeToSpend,
    );

    const bySource = result.allFlows!.reduce((map, flow) => {
      const source = flow.origin ?? 'UNKNOWN';
      map.set(source, (map.get(source) ?? 0) + 1);
      return map;
    }, new Map<string, number>());

    expect(bySource.get(FlowSource.BUDGET)).toBeGreaterThan(200);
    expect(bySource.get(FlowSource.PLANNED_PAYMENT)).toBeGreaterThanOrEqual(4);
    const resolvedCount = result.allFlows!.filter(f => f.resolution === 'MERGED').length;
    expect(resolvedCount).toBeGreaterThanOrEqual(1);
    expect(result.allFlows!.some(flow => flow.kind === 'TRANSFER')).toBe(true);

    for (const flow of result.allFlows!) {
      expect(Number.isFinite(flow.amount)).toBe(true);
      expect(flow.amount).toBeGreaterThan(0);
      expect(flow.dayOffset).toBeGreaterThanOrEqual(0);
      expect(flow.dayOffset).toBeLessThan(AppConfig.defaults.safeToSpendDays);
    }

    for (const projection of result.simulationResult.projections) {
      expect(Number.isFinite(projection.globalBalance)).toBe(true);
      expect(projection.timestamp).toBeGreaterThan(0);
    }
  });

  it('handles many generated journals without double-counting covered planned payment templates', async () => {
    const cash = makeAsset('cash', 'Checking');
    const expenseAccounts = Array.from({ length: 12 }, (_, index) =>
      makeExpense(`journal-exp-${index}`, `Journal Expense ${index}`),
    );

    const plannedPayments = expenseAccounts.map((expense, index) => ({
      id: `pp-journal-${index}`,
      name: `Template ${index}`,
      fromAccountId: 'cash',
      toAccountId: expense.id,
      amount: 50 + index,
      nextOccurrence: atDay(index + 1),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    })) as any[];

    const plannedJournals = plannedPayments.map(
      (payment, index) =>
        ({
          id: `journal-${index}`,
          description: `Generated Journal ${index}`,
          journalDate: payment.nextOccurrence,
          plannedPaymentId: payment.id,
        }) as any,
    );

    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue(
      plannedJournals.flatMap((journal, index) => [
        {
          journalId: journal.id,
          accountId: 'cash',
          transactionType: 'CREDIT',
          amount: 50 + index,
        },
        {
          journalId: journal.id,
          accountId: expenseAccounts[index].id,
          transactionType: 'DEBIT',
          amount: 50 + index,
        },
      ]),
    );

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash', 2000]]),
      plannedPayments,
      plannedJournals,
      ['cash'],
      [],
      [],
      [],
      [cash, ...expenseAccounts],
      'USD',
    );

    const plannedFlows = result.allFlows!.filter(
      flow =>
        flow.origin === FlowSource.PLANNED_PAYMENT || flow.origin === FlowSource.PLANNED_JOURNAL,
    );
    const templateIds = new Set(plannedPayments.map(payment => payment.id));
    const generatedJournalIds = new Set(plannedJournals.map(journal => journal.id));

    expect(plannedFlows).toHaveLength(plannedJournals.length);
    expect(plannedFlows.every(flow => generatedJournalIds.has(flow.referenceId ?? ''))).toBe(true);
    expect(plannedFlows.some(flow => templateIds.has(flow.referenceId ?? ''))).toBe(false);
    expect(result.simulationResult.summary.safeToSpend).toBe(1334);
    expect(result.simulationResult.summary.shortfall).toBe(0);
  });

  it('handles a large negative-cash scenario and reports coherent shortfall', async () => {
    const cash = makeAsset('cash', 'Checking');
    const plannedPayments = Array.from({ length: 20 }, (_, index) => ({
      id: `large-outflow-${index}`,
      name: `Large Outflow ${index}`,
      fromAccountId: 'cash',
      toAccountId: `external-${index}`,
      amount: 75,
      nextOccurrence: atDay(index % 10),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    })) as any[];

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash', 500]]),
      plannedPayments,
      [],
      ['cash'],
      [],
      [],
      [],
      [cash],
      'USD',
    );

    expect(result.simulationResult.summary.safeToSpend).toBe(0);
    expect(result.simulationResult.summary.shortfall).toBe(2500);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(-2500);
    expect(
      result.simulationResult.projections[result.simulationResult.projections.length - 1]
        .globalBalance,
    ).toBe(-2500);
    expect(result.allFlows).toHaveLength(40);
    expect(result.allFlows!.every(flow => flow.origin === FlowSource.PLANNED_PAYMENT)).toBe(true);
  });
});
