import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { cashFlowSimulationServiceV2 } from '@/src/services/simulation/v2/CashFlowSimulationServiceV2';
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

const cashAccount = {
  id: 'cash',
  name: 'Cash',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as const;

const creditCardAccount = {
  id: 'cc',
  name: 'Credit Card',
  accountType: AccountType.LIABILITY,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  currencyCode: 'USD',
  metadataRecords: {
    fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15, payFromAccountId: 'cash' }]),
  },
} as any;

const futureCreditCardSpend = [
  {
    id: 'pp-cc',
    name: 'April CC spend',
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
    name: 'May CC spend',
    fromAccountId: 'cc',
    toAccountId: 'exp-dining',
    amount: 400,
    nextOccurrence: dayjs('2026-05-20T12:00:00Z').valueOf(),
    intervalType: 'MONTHLY',
    intervalN: 1,
    currencyCode: 'USD',
  },
] as any[];

const runFutureCreditCardScenario = async () => {
  const startingBalances = new Map([['cash', 1500]]);
  const budgets = [
    {
      id: 'b-dining',
      name: 'Dining',
      amount: 500,
      currencyCode: 'USD',
      assetAccountIds: 'cash',
    },
  ] as any[];
  const usages: BudgetUsage[] = [{ budgetId: 'b-dining', remaining: 300 } as any];

  const liabilities = [{ account: creditCardAccount, balance: 0 }];
  const allAccounts = [cashAccount, creditCardAccount];

  const [v1Result, v2Result] = await Promise.all([
    cashFlowSimulationService.simulate(
      startingBalances,
      futureCreditCardSpend,
      [],
      ['cash'],
      liabilities,
      budgets,
      usages,
      allAccounts,
      'USD',
    ),
    cashFlowSimulationServiceV2.simulate(
      startingBalances,
      futureCreditCardSpend,
      [],
      ['cash'],
      liabilities,
      budgets,
      usages,
      allAccounts,
      'USD',
    ),
  ]);

  return { v1Result, v2Result };
};

describe('Simulation V2 parity issues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockResolvedValue({
      totalDecrease: 0,
      totalIncrease: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches safe-to-spend against V1 for future liability spend that rolls into obligations', async () => {
    const { v1Result, v2Result } = await runFutureCreditCardScenario();

    expect(v2Result.summary.safeToSpend).toBe(v1Result.summary.safeToSpend);
  });

  it('keeps committed-planned totals aligned with the legacy result when future spends are outside the window', async () => {
    const { v1Result, v2Result } = await runFutureCreditCardScenario();

    expect(v2Result.summary.totalCommittedPlanned).toBe(v1Result.summary.totalCommittedPlanned);
  });
});
