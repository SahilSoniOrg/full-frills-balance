import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { cashFlowSimulationServiceV2 } from '@/src/services/simulation/v2/CashFlowSimulationServiceV2';
import dayjs from 'dayjs';

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
  budgetRepository: { getScopes: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn().mockImplementation(amount => Promise.resolve({ convertedAmount: amount })),
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

    const result = await cashFlowSimulationServiceV2.simulate(
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
      result.allFlows.filter(f => f.meta?.source === 'LIABILITY'),
    );
    console.log('account summaries', result.accountSummaries);
    console.log('summary', result.summary);
    expect(result.summary.safeToSpend).toBeDefined();
  });
});
