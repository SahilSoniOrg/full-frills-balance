import { AccountSubtype, AccountType, AccountId, WorkplaceId } from '@/src/types/domain';

import {
  cashFlowSimulationService,
  SimulationInput,
} from '@/src/services/simulation/CashFlowSimulationService';
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

const checkingAccount = {
  id: 'checking-1' as AccountId,
  name: 'Checking',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as any;

const creditCardAccount = {
  id: 'cc-1' as AccountId,
  name: 'Credit Card',
  accountType: AccountType.LIABILITY,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  currencyCode: 'USD',
  metadataRecords: {
    fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15 }]),
  },
} as any;

const simulate = (overrides: Partial<SimulationInput> = {}) => {
  const input: SimulationInput = {
    startingBalances: new Map<AccountId, number>([['checking-1' as AccountId, 2000]]),
    plannedPayments: [],
    plannedJournals: [],
    liquidAssetIds: ['checking-1' as AccountId],
    liabilityAccountBalances: [{ account: creditCardAccount, balance: 1000 }],
    budgets: [],
    usages: [],
    allAccounts: [checkingAccount, creditCardAccount],
    resultCurrency: 'USD',
    workplaceId: 'test-wp' as WorkplaceId,
    ...overrides,
  };

  return cashFlowSimulationService.simulate(input);
};

describe('Liability payment coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deducts a planned credit card payment from safe-to-spend', async () => {
    const plannedPayment = {
      id: 'pp-cc-payment',
      name: 'CC Payment',
      fromAccountId: 'checking-1',
      toAccountId: creditCardAccount.id,
      amount: 1000,
      nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    const result = await simulate({ plannedPayments: [plannedPayment] });

    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
  });
});
