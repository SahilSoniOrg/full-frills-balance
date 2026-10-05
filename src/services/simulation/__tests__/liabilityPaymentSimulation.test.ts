import PlannedPayment from '@/src/data/models/PlannedPayment';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import dayjs from 'dayjs';
import type { SimulationInput } from '../CashFlowSimulationService';
import {
  accountQueryRepository,
  cashFlowSimulationService,
  defaultWorkplaceId,
  installCashFlowSimulationTestHooks,
  makeAsset,
  makeCreditCard,
} from './cashFlowSimulationTestHarness';

const checkingAccount = {
  id: 'checking-1' as AccountId,
  name: 'Checking',
  accountType: AccountType.ASSET,
  accountSubtype: AccountSubtype.BANK_CHECKING,
  currencyCode: 'USD',
} as const;

const creditCardForCoverage = {
  id: 'cc-1' as AccountId,
  name: 'Credit Card',
  accountType: AccountType.LIABILITY,
  accountSubtype: AccountSubtype.CREDIT_CARD,
  currencyCode: 'USD',
  metadataRecords: {
    fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15 }]),
  },
} as any;

const simulateCoverage = (overrides: Partial<SimulationInput> = {}) =>
  cashFlowSimulationService.simulate({
    startingBalances: new Map<AccountId, number>([['checking-1' as AccountId, 2000]]),
    plannedPayments: [],
    plannedJournals: [],
    liquidAssetIds: ['checking-1' as AccountId],
    liabilityAccountBalances: [{ account: creditCardForCoverage, balance: 1000 }],
    budgets: [],
    usages: [],
    allAccounts: [checkingAccount, creditCardForCoverage],
    resultCurrency: 'USD',
    workplaceId: defaultWorkplaceId,
    ...overrides,
  });

describe('liability payment simulation', () => {
  installCashFlowSimulationTestHooks();

  beforeEach(() => {
    (creditCardForCoverage.metadataRecords.fetch as jest.Mock).mockResolvedValue([
      { statementDay: 1, dueDay: 15 },
    ]);
    (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([]);
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

    const ccForIssue = makeCreditCard('cc', { payFromAccountId: 'cash' });
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
      plannedPayments,
      plannedJournals: [],
      liquidAssetIds: ['cash' as AccountId],
      liabilityAccountBalances: [{ account: ccForIssue, balance: 0 }],
      budgets: [],
      usages: [],
      allAccounts: [makeAsset('cash', 'Cash'), ccForIssue],
      resultCurrency: 'USD',
      workplaceId: defaultWorkplaceId,
      simulationDays: 60,
    } as SimulationInput);

    expect(result.simulationResult.summary.safeToSpend).toBeDefined();
  });

  it('deducts a planned credit card payment from safe-to-spend', async () => {
    const plannedPayment = {
      id: 'pp-cc-payment',
      name: 'CC Payment',
      fromAccountId: 'checking-1',
      toAccountId: creditCardForCoverage.id,
      amount: 1000,
      nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    const result = await simulateCoverage({ plannedPayments: [plannedPayment] });

    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
  });
});
