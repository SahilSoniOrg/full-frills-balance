import { AccountSubtype, AccountType, AccountId, WorkplaceId } from '@/src/types/domain';

import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountQueryRepository } from '@/src/data/repositories/account';
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
jest.mock('@/src/data/repositories/transaction', () => ({
  ...jest.requireActual('@/src/data/repositories/transaction'),

  transactionQueryRepository: { findByJournals: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    getScopes: jest.fn().mockResolvedValue([]),
    getScopesByBudgetIds: jest.fn().mockResolvedValue([]),
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

jest.mock('@/src/data/repositories/account', () => ({
  ...jest.requireActual('@/src/data/repositories/account'),

  accountQueryRepository: {
    findMetadataByAccountIds: jest.fn().mockResolvedValue([]),
  },
}));

const cashAccount = {
  id: 'cash' as AccountId,
  name: 'Cash',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as any;
const creditCardAccount = {
  id: 'cc' as AccountId,
  name: 'Credit Card',
  accountType: AccountType.LIABILITY,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  currencyCode: 'USD',
  metadataRecords: {
    fetch: jest
      .fn()
      .mockResolvedValue([{ statementDay: 1, dueDay: 15, payFromAccountId: 'cash' as AccountId }]),
  },
} as any;

describe('liability flow issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('logs unpaid obligations for future outflows', async () => {
    const plannedPayments = [
      {
        id: 'spend-now',
        fromAccountId: 'cc' as AccountId,
        toAccountId: 'exp' as AccountId,
        amount: 200,
        nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
      {
        id: 'spend-late',
        fromAccountId: 'cc' as AccountId,
        toAccountId: 'exp' as AccountId,
        amount: 300,
        nextOccurrence: dayjs('2026-05-05T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      },
    ] as PlannedPayment[];

    (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
      {
        accountId: 'cc' as AccountId,
        statementDay: 1,
        dueDay: 15,
        payFromAccountId: 'cash' as AccountId,
      },
    ]);

    const result = await cashFlowSimulationService.simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1200]]),
      plannedPayments: plannedPayments,
      plannedJournals: [],
      liquidAssetIds: ['cash' as AccountId],
      liabilityAccountBalances: [{ account: creditCardAccount, balance: 0 }],
      budgets: [],
      usages: [],
      allAccounts: [cashAccount, creditCardAccount],
      resultCurrency: 'USD',
      workplaceId: 'test-wp' as WorkplaceId,
      simulationDays: 60,
    });

    console.log(
      'liability flows',
      result.allFlows!.filter(f => f.origin === 'LIABILITY'),
    );
    console.log('account summaries', result.accountSummaries!);

    console.log('summary', result.simulationResult.summary);
    expect(result.simulationResult.summary.safeToSpend).toBeDefined();
  });
});
