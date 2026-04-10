import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { simulationV2Adapter } from '@/src/services/simulation/v2/SimulationV2Adapter';
import dayjs from 'dayjs';

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

jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    getScopes: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn().mockImplementation(amount => Promise.resolve({ convertedAmount: amount })),
  },
}));

const baseCashAccount = {
  id: 'cash',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as any;

describe('liability parity finder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('looks for misapplied liability payments', async () => {
    const paymentDays = [5, 10];
    const paymentAmounts = [200, 300];

    for (const day of paymentDays) {
      for (const amount of paymentAmounts) {
        const ccA = {
          id: 'cc-a',
          accountType: AccountType.LIABILITY,
          accountSubtype: AccountSubtype.CREDIT_CARD,
          metadataRecords: {
            fetch: jest
              .fn()
              .mockResolvedValue([{ statementDay: 1, dueDay: 15, payFromAccountId: 'cash' }]),
          },
        } as any;
        const ccB = {
          id: 'cc-b',
          accountType: AccountType.LIABILITY,
          accountSubtype: AccountSubtype.CREDIT_CARD,
          metadataRecords: {
            fetch: jest
              .fn()
              .mockResolvedValue([{ statementDay: 1, dueDay: 15, payFromAccountId: 'cash' }]),
          },
        } as any;

        const plannedPayment = {
          id: 'pp-pay-a',
          name: 'Pay CC A',
          fromAccountId: 'cash',
          toAccountId: 'cc-a',
          amount,
          nextOccurrence: dayjs('2026-04-01T00:00:00Z').add(day, 'day').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        } as any;

        const [v1Result, v2Result] = await Promise.all([
          cashFlowSimulationService.simulate(
            new Map([['cash', 1000]]),
            [plannedPayment],
            [],
            ['cash'],
            [
              { account: ccA, balance: 400 },
              { account: ccB, balance: 400 },
            ],
            [],
            [],
            [{ ...baseCashAccount, name: 'Cash' }, ccA, ccB],
            'USD',
          ),
          simulationV2Adapter.simulate(
            new Map([['cash', 1000]]),
            [plannedPayment],
            [],
            ['cash'],
            [
              { account: ccA, balance: 400 },
              { account: ccB, balance: 400 },
            ],
            [],
            [],
            [{ ...baseCashAccount, name: 'Cash' }, ccA, ccB],
            'USD',
          ),
        ]);

        const ccADebtV1 = v1Result.breakdowns.debt.find(d => d.accountId === 'cc-a');
        const ccADebtV2 = v2Result.breakdowns.debt.find(d => d.accountId === 'cc-a');
        const ccBDebtV2 = v2Result.breakdowns.debt.find(d => d.accountId === 'cc-b');

        if (ccBDebtV2?.amount && ccADebtV2?.amount !== ccADebtV1?.amount) {
          console.log('Mismatch', { day, amount, v1: ccADebtV1, v2: ccADebtV2, ccB: ccBDebtV2 });
          throw new Error('Liability payment mismatch');
        }
      }
    }
  }, 60000);
});
