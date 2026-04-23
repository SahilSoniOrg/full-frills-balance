import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import dayjs from 'dayjs';

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    metric: jest.fn(),
  },
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
jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    getScopes: jest.fn().mockResolvedValue([]),
    getScopesByBudgetIds: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn().mockImplementation(amount => Promise.resolve({ convertedAmount: amount })),
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
    getRateSafe: jest.fn().mockReturnValue(1),
  },
}));

jest.mock('@/src/data/repositories/AccountRepository', () => ({
  accountRepository: {
    findMetadataByAccountIds: jest.fn().mockResolvedValue([]),
  },
}));

const cashAccount = {
  id: 'cash',
  name: 'Cash',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as any;
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

describe('liability flow issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('logs unpaid obligations for future outflows', async () => {
    const plannedPayments = [
      {
        id: 'spend-now',
        fromAccountId: 'cc',
        toAccountId: 'exp',
        amount: 200,
        nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      {
        id: 'spend-late',
        fromAccountId: 'cc',
        toAccountId: 'exp',
        amount: 300,
        nextOccurrence: dayjs('2026-05-05T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
    ] as PlannedPayment[];

    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
      { accountId: 'cc', statementDay: 1, dueDay: 15, payFromAccountId: 'cash' },
    ]);

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash', 1200]]),
      plannedPayments,
      [],
      ['cash'],
      [{ account: creditCardAccount, balance: 0 }],
      [],
      [],
      [cashAccount, creditCardAccount],
      'USD',
    );

    console.log(
      'liability flows',
      result.allFlows!.filter(f => f.origin === 'LIABILITY'),
    );
    console.log('account summaries', result.accountSummaries!);

    console.log('summary', result.simulationResult.summary);
    expect(result.simulationResult.summary.safeToSpend).toBeDefined();
  });
});
