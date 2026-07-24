import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import dayjs from 'dayjs';
import { AccountId, WorkplaceId } from '@/src/types/domain';

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

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn().mockImplementation(amount => Promise.resolve({ convertedAmount: amount })),
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
    getRateSafe: jest.fn().mockReturnValue(1),
  },
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

type SimulateArgs = Parameters<typeof cashFlowSimulationService.simulate>;
type OverrideMap = Partial<{ [K in keyof SimulateArgs]: SimulateArgs[K] }>;

const simulate = (overrides: OverrideMap = {} as any, planned: SimulateArgs[1] = []) => {
  const defaultArgs: Parameters<typeof cashFlowSimulationService.simulate> = [
    new Map<AccountId, number>([['checking-1' as AccountId, 2000]]),
    planned,
    [],
    ['checking-1' as AccountId],
    [{ account: creditCardAccount, balance: 1000 }],
    [],
    [],
    [checkingAccount, creditCardAccount],
    'USD',
    'test-wp' as WorkplaceId,
  ];

  Object.entries(overrides).forEach(([index, value]) => {
    (defaultArgs as any)[Number(index)] = value;
  });

  return cashFlowSimulationService.simulate(...defaultArgs);
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

    const result = await simulate({ 1: [plannedPayment] }, [plannedPayment as any]);

    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
  });
});
