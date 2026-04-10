import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { cashFlowSimulationServiceV2 } from '@/src/services/simulation/v2/CashFlowSimulationServiceV2';
import dayjs from 'dayjs';

jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: { getScopes: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/src/data/repositories/TransactionRawRepository', () => ({
  transactionRawRepository: {
    getLatestBalancesRaw: jest.fn().mockResolvedValue(new Map()),
    getAccountPeriodMetricsRaw: jest.fn().mockResolvedValue({ totalDecrease: 0, totalIncrease: 0 }),
  },
}));
jest.mock('@/src/data/repositories/TransactionRepository', () => ({
  transactionRepository: { findByJournals: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn().mockImplementation(amount => Promise.resolve({ convertedAmount: amount })),
  },
}));

const cashAccount: Account = {
  id: 'cash',
  name: 'Cash',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as Account;

const creditCardAccount: Account = {
  id: 'cc',
  name: 'Credit Card',
  accountType: AccountType.LIABILITY,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  currencyCode: 'USD',
  metadataRecords: {
    fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15, payFromAccountId: 'cash' }]),
  },
} as any;

describe('parity search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('compares V1 vs V2 safe-to-spend for future credit card spend', async () => {
    const plannedPayments = [
      {
        id: 'pp-cc',
        name: 'CC spend 1',
        fromAccountId: 'cc',
        toAccountId: 'exp-dining',
        amount: 300,
        nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      {
        id: 'pp-cc-future',
        name: 'CC spend 2',
        fromAccountId: 'cc',
        toAccountId: 'exp-dining',
        amount: 400,
        nextOccurrence: dayjs('2026-05-20T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
    ] as any[];

    const budgets = [
      {
        id: 'b-dining',
        name: 'Dining',
        amount: 500,
        assetAccountIds: 'cash',
        currencyCode: 'USD',
      },
    ] as any[];

    const usages: BudgetUsage[] = [{ budgetId: 'b-dining', remaining: 300 } as any];

    const startingBalances = new Map([['cash', 1500]]);
    const liabilityBalances = [{ account: creditCardAccount, balance: 0 }];
    const allAccounts = [cashAccount, creditCardAccount];

    const [v1Result, v2Result] = await Promise.all([
      cashFlowSimulationService.simulate(
        startingBalances,
        plannedPayments,
        [],
        ['cash'],
        liabilityBalances,
        budgets as any,
        usages as any,
        allAccounts,
        'USD',
      ),
      cashFlowSimulationServiceV2.simulate(
        startingBalances,
        plannedPayments,
        [],
        ['cash'],
        liabilityBalances,
        budgets as any,
        usages as any,
        allAccounts,
        'USD',
      ),
    ]);

    const diff = Math.abs(v1Result.summary.safeToSpend - v2Result.summary.safeToSpend);
    console.log('v1 flows', v1Result.breakdowns.debt);
    console.log('v2 flows', v2Result.breakdowns.liabilities);
    expect(diff).toBeLessThanOrEqual(0.01);
  });
});
