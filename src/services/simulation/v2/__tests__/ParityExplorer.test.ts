import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
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

const makeBudget = (id: string) => ({
  id,
  name: `Budget ${id}`,
  amount: 200,
  currencyCode: 'USD',
  assetAccountIds: 'cash',
});

describe('parity explorer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('looks for mismatch scenarios between V1 and V2', async () => {
    const amounts = [150, 250];
    const secondAmounts = [80, 200];
    const days = [5, 10, 20];

    for (const firstAmount of amounts) {
      for (const secondAmount of secondAmounts) {
        for (const day of days) {
          const plannedPayments = [
            {
              id: `pp-1-${firstAmount}-${day}`,
              name: 'First spend',
              fromAccountId: 'cash',
              toAccountId: 'exp-groceries',
              amount: firstAmount,
              nextOccurrence: dayjs('2026-04-01T00:00:00Z').add(day, 'day').valueOf(),
              intervalType: 'MONTHLY',
              intervalN: 1,
              currencyCode: 'USD',
            },
            {
              id: `pp-2-${secondAmount}-${day}`,
              name: 'Second spend',
              fromAccountId: 'cash',
              toAccountId: 'exp-dining',
              amount: secondAmount,
              nextOccurrence: dayjs('2026-04-01T00:00:00Z').add(day, 'day').valueOf(),
              intervalType: 'MONTHLY',
              intervalN: 1,
              currencyCode: 'USD',
            },
          ] as any[];

          const budgets = [makeBudget('b-food'), makeBudget('b-other')];
          const usages: BudgetUsage[] = [
            { budgetId: 'b-food', remaining: 200 } as any,
            { budgetId: 'b-other', remaining: 100 } as any,
          ];
          (budgetRepository.getScopes as jest.Mock).mockImplementation(async (budgetId: string) => {
            if (budgetId === 'b-food') {
              return [{ account: { id: 'exp-groceries', accountType: AccountType.EXPENSE } }];
            }
            if (budgetId === 'b-other') {
              return [{ account: { id: 'exp-dining', accountType: AccountType.EXPENSE } }];
            }
            return [];
          });

          const startingBalances = new Map([['cash', 1000]]);
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
            simulationV2Adapter.simulate(
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
          if (diff > 0.5) {
            console.log('Found diff', diff, { firstAmount, secondAmount, day });
            console.log({ v1: v1Result.summary, v2: v2Result.summary });
            throw new Error('Parity diff detected ' + diff);
          }
        }
      }
    }
  }, 60000);
});
