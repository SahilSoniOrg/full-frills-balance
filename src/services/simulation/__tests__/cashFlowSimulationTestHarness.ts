import Account from '@/src/data/models/Account';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { accountLedgerMetricsQueries } from '@/src/data/repositories/account/AccountLedgerMetricsQueries';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  cashFlowSimulationService,
  SimulationInput,
} from '@/src/services/simulation/CashFlowSimulationService';
import { convertAmount, resolveSpotExchangeRate } from '@/src/services/currencyConversion';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import dayjs from 'dayjs';

jest.mock('@/src/data/repositories/account/AccountLedgerMetricsQueries', () => ({
  accountLedgerMetricsQueries: { getPeriodMetrics: jest.fn() },
}));
jest.mock('@/src/data/repositories/raw/TransactionRawMetricsQueries', () => ({
  transactionRawMetricsQueries: { getLatestBalancesRaw: jest.fn() },
}));
jest.mock('@/src/data/repositories/transaction', () => ({
  ...jest.requireActual('@/src/data/repositories/transaction'),
  transactionQueryRepository: {
    findByJournals: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    getScopes: jest.fn().mockResolvedValue([]),
    getScopesByBudgetIds: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/data/repositories/PlannedPaymentRepository', () => ({
  plannedPaymentRepository: {
    findManyByIds: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/data/repositories/account', () => ({
  ...jest.requireActual('@/src/data/repositories/account'),
  accountQueryRepository: {
    findMetadataByAccountIds: jest.fn().mockResolvedValue([]),
  },
  accountRawRepository: {
    findManyByIdsRaw: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('@/src/services/currencyConversion', () => ({
  convertAmount: jest.fn(async ({ amount }: { amount: number }) => ({ ok: true, amount })),
  resolveSpotExchangeRate: jest.fn(async (fromCurrency: string) => ({
    ok: true,
    rate: fromCurrency === 'EUR' ? 2 : 1,
  })),
}));
jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    metric: jest.fn(),
  },
}));

export const simulationAnchor = '2026-04-01T00:00:00Z';
export const defaultWorkplaceId = 'test-wp' as WorkplaceId;
export const pipelineWorkplaceId = 'wp-1' as WorkplaceId;

export {
  accountLedgerMetricsQueries,
  accountQueryRepository,
  budgetRepository,
  cashFlowSimulationService,
  convertAmount,
  resolveSpotExchangeRate,
  transactionQueryRepository,
  transactionRawMetricsQueries,
};

export function resetCashFlowSimulationMocks(): void {
  (budgetRepository.getScopes as jest.Mock).mockResolvedValue([]);
  (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([]);
  (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([]);
  (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
  (accountLedgerMetricsQueries.getPeriodMetrics as jest.Mock).mockResolvedValue({
    totalDecrease: 0,
    totalIncrease: 0,
  });
  (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
  (resolveSpotExchangeRate as jest.Mock).mockImplementation(async (fromCurrency: string) => ({
    ok: true,
    rate: fromCurrency === 'EUR' ? 2 : 1,
  }));
  (convertAmount as jest.Mock).mockImplementation(async ({ amount }: { amount: number }) => ({
    ok: true,
    amount,
  }));
}

export function installCashFlowSimulationTestHooks(): void {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(simulationAnchor));
    resetCashFlowSimulationMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });
}

export const atSimulationDay = (dayOffset: number) =>
  dayjs(simulationAnchor).add(dayOffset, 'day').hour(12).valueOf();

export const makeAsset = (
  id: string,
  name = id,
  currencyCode = 'USD',
  subtype = AccountSubtype.BANK_CHECKING,
) =>
  ({
    id: id as AccountId,
    name,
    accountType: AccountType.ASSET,
    accountSubtype: subtype,
    currencyCode,
  }) as Account;

export const makeExpense = (id: string, name = id, currencyCode = 'USD') =>
  ({
    id: id as AccountId,
    name,
    accountType: AccountType.EXPENSE,
    currencyCode,
  }) as Account;

export const makeCreditCard = (
  id: string,
  options?: {
    name?: string;
    statementDay?: number;
    dueDay?: number;
    payFromAccountId?: string;
    currencyCode?: string;
  },
) =>
  ({
    id: id as AccountId,
    name: options?.name ?? id,
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.CREDIT_CARD,
    currencyCode: options?.currencyCode ?? 'USD',
    metadataRecords: {
      fetch: jest.fn().mockResolvedValue([
        {
          statementDay: options?.statementDay ?? 1,
          dueDay: options?.dueDay ?? 15,
          payFromAccountId: (options?.payFromAccountId ?? 'cash') as AccountId,
        },
      ]),
    },
  }) as unknown as Account;

export const makeLoan = (
  id: string,
  options?: {
    name?: string;
    emiDay?: number;
    payFromAccountId?: string;
    currencyCode?: string;
    emiAmount?: number;
  },
) =>
  ({
    id: id as AccountId,
    name: options?.name ?? id,
    accountType: AccountType.LIABILITY,
    accountSubtype: AccountSubtype.LOAN,
    currencyCode: options?.currencyCode ?? 'USD',
    metadataRecords: {
      fetch: jest.fn().mockResolvedValue([
        {
          emiDay: options?.emiDay ?? 20,
          payFromAccountId: (options?.payFromAccountId ?? 'cash') as AccountId,
          emiAmount: options?.emiAmount ?? 100,
        },
      ]),
    },
  }) as unknown as Account;

export function buildPipelineAccounts() {
  const workplaceId = pipelineWorkplaceId;
  const cash = makeAsset('acc-cash', 'Cash');
  const bank = makeAsset('acc-bank', 'Bank Checking');
  const creditCard = makeCreditCard('acc-cc', {
    name: 'Credit Card',
    payFromAccountId: bank.id,
  });
  (creditCard.metadataRecords.fetch as jest.Mock).mockResolvedValue([
    { statementDay: 1, dueDay: 15, gracePeriodDays: 14, payFromAccountId: bank.id },
  ]);
  const groceriesCategory = makeExpense('exp-groceries', 'Groceries');
  const diningCategory = makeExpense('exp-dining', 'Dining Out');
  const incomeCategory = makeExpense('inc-salary', 'Salary');
  incomeCategory.accountType = AccountType.INCOME;
  return {
    workplaceId,
    baseDate: dayjs(simulationAnchor),
    cash,
    bank,
    creditCard,
    groceriesCategory,
    diningCategory,
    incomeCategory,
    allAccounts: [cash, bank, creditCard, groceriesCategory, diningCategory, incomeCategory],
  };
}

export function buildUsdWalletFixture(workplaceId: WorkplaceId = defaultWorkplaceId) {
  const cash = makeAsset('cash', 'Checking');
  const savings = makeAsset('savings', 'Savings', 'USD', AccountSubtype.BANK_SAVINGS);
  const groceries = makeExpense('exp-groceries', 'Groceries');
  const dining = makeExpense('exp-dining', 'Dining');
  const cc = makeCreditCard('cc', { name: 'Credit Card', payFromAccountId: 'cash' });
  const loan = makeLoan('loan', { name: 'Personal Loan', emiAmount: 350 });
  const liquidAccountId = 'acc-checking' as AccountId;
  const checkingAccount = {
    ...makeAsset(liquidAccountId, 'Main Checking'),
    workplaceId,
  } as unknown as Account;
  const savingsAccount = {
    ...makeAsset('acc-savings', 'High Yield Savings', 'USD', AccountSubtype.BANK_SAVINGS),
    workplaceId,
  } as unknown as Account;
  const creditCardAccount = {
    ...makeCreditCard('acc-credit-card', { payFromAccountId: liquidAccountId }),
    workplaceId,
  } as unknown as Account;
  const foodExpenseAccount = {
    ...makeExpense('acc-food-leaf', 'Groceries Leaf'),
    workplaceId,
  } as unknown as Account;
  const rentExpenseAccount = {
    ...makeExpense('acc-rent-leaf', 'Rent Leaf'),
    workplaceId,
  } as unknown as Account;
  return {
    workplaceId,
    cash,
    savings,
    groceries,
    dining,
    cc,
    loan,
    liquidAccountId,
    checkingAccount,
    savingsAccount,
    creditCardAccount,
    foodExpenseAccount,
    rentExpenseAccount,
    characterizationAccounts: [
      checkingAccount,
      savingsAccount,
      creditCardAccount,
      foodExpenseAccount,
      rentExpenseAccount,
    ],
  };
}

export async function simulateCashFlow(
  overrides: Record<string, unknown> = {},
): Promise<Awaited<ReturnType<typeof cashFlowSimulationService.simulate>>> {
  const workplaceId = (overrides.workplaceId as WorkplaceId | undefined) ?? defaultWorkplaceId;
  const wallet = buildUsdWalletFixture(workplaceId);
  const input = {
    startingBalances: new Map<AccountId, number>([[wallet.cash.id, 1000]]),
    plannedPayments: [],
    plannedJournals: [],
    liquidAssetIds: [wallet.cash.id],
    liabilityAccountBalances: [],
    budgets: [],
    usages: [],
    allAccounts: [wallet.cash],
    resultCurrency: 'USD',
    workplaceId,
    simulationDays: 60,
    ...overrides,
  } as SimulationInput;

  const metadataList = await Promise.all(
    input.liabilityAccountBalances.map(async lb => {
      const fetchRes = await (
        lb.account as { metadataRecords: { fetch: () => Promise<unknown[]> } }
      ).metadataRecords.fetch();
      return {
        accountId: lb.account.id,
        ...(fetchRes[0] as object),
      };
    }),
  );
  (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue(metadataList);

  return cashFlowSimulationService.simulate(input);
}

export function buildPipelineSimulate(
  accounts: ReturnType<typeof buildPipelineAccounts>,
  overrides: Record<string, unknown> = {},
) {
  const { cash, bank, creditCard, groceriesCategory, diningCategory, incomeCategory, workplaceId } =
    accounts;
  return cashFlowSimulationService.simulate({
    startingBalances: new Map([[cash.id, 5000]]),
    plannedPayments: [],
    plannedJournals: [],
    liquidAssetIds: [cash.id, bank.id],
    liabilityAccountBalances: [],
    budgets: [],
    usages: [],
    allAccounts: [cash, bank, creditCard, groceriesCategory, diningCategory, incomeCategory],
    resultCurrency: 'USD',
    workplaceId,
    simulationDays: 30,
    ...overrides,
  } as SimulationInput);
}
