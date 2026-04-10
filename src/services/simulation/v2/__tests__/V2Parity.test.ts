import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { simulationV2Adapter } from '@/src/services/simulation/v2/SimulationV2Adapter';
import dayjs from 'dayjs';

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

const checkingAccount = {
  id: 'checking-1',
  name: 'Checking',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as const;

const creditCardAccount = {
  id: 'cc-1',
  name: 'Credit Card',
  accountType: AccountType.LIABILITY,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  currencyCode: 'USD',
  metadataRecords: {
    fetch: jest
      .fn()
      .mockResolvedValue([{ statementDay: 1, dueDay: 15, payFromAccountId: 'checking-1' }]),
  },
} as any;

const plannedPayment = {
  id: 'pp-1',
  name: 'Card payment',
  fromAccountId: 'checking-1',
  toAccountId: creditCardAccount.id,
  amount: 1000,
  nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
  intervalType: 'MONTHLY',
  intervalN: 1,
  currencyCode: 'USD',
} as any;

describe('Simulation V2 parity against V1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches V1 safe-to-spend and commitments for a planned liability payment', async () => {
    const v1Result = await cashFlowSimulationService.simulate(
      new Map([['checking-1', 2000]]),
      [plannedPayment],
      [],
      ['checking-1'],
      [{ account: creditCardAccount, balance: 1000 }],
      [],
      [],
      [checkingAccount, creditCardAccount],
      'USD',
    );

    const v2Result = await simulationV2Adapter.simulate(
      new Map([['checking-1', 2000]]),
      [plannedPayment],
      [],
      ['checking-1'],
      [{ account: creditCardAccount, balance: 1000 }],
      [],
      [],
      [checkingAccount, creditCardAccount],
      'USD',
    );

    expect(v2Result.summary.safeToSpend).toBe(v1Result.summary.safeToSpend);
    expect(v2Result.summary.shortfall).toBe(v1Result.summary.shortfall);
    expect(v2Result.summary.totalCommittedPlanned).toBe(v1Result.summary.totalCommittedPlanned);
  });

  it('aligns with V1 for a budget covering planned spend', async () => {
    const budgets = [
      {
        id: 'budget-food',
        name: 'Food',
        amount: 100,
        currencyCode: 'USD',
        assetAccountIds: 'checking-1',
      },
    ] as any;

    const usages = [
      {
        budgetId: 'budget-food',
        remaining: 50,
      },
    ] as any;

    (budgetRepository.getScopes as jest.Mock).mockResolvedValue([
      {
        account: {
          id: 'exp-groceries',
          accountType: 'EXPENSE',
        },
      },
    ]);

    const plannedGroceries = {
      id: 'pp-groceries',
      name: 'Groceries',
      fromAccountId: 'checking-1',
      toAccountId: 'exp-groceries',
      amount: 120,
      nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    const v1Result = await cashFlowSimulationService.simulate(
      new Map([['checking-1', 500]]),
      [plannedGroceries],
      [],
      ['checking-1'],
      [{ account: creditCardAccount, balance: 0 }],
      budgets as any,
      usages as any,
      [checkingAccount, creditCardAccount],
      'USD',
    );

    const v2Result = await simulationV2Adapter.simulate(
      new Map([['checking-1', 500]]),
      [plannedGroceries],
      [],
      ['checking-1'],
      [{ account: creditCardAccount, balance: 0 }],
      budgets as any,
      usages as any,
      [checkingAccount, creditCardAccount],
      'USD',
    );

    expect(v2Result.summary.safeToSpend).toBe(v1Result.summary.safeToSpend);
    expect(v2Result.summary.totalCommittedPlanned).toBe(v1Result.summary.totalCommittedPlanned);
  });
});
