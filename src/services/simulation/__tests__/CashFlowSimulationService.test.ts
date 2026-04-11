import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
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
    convert: jest.fn((amount: number, from?: string) =>
      Promise.resolve({ convertedAmount: from === 'EUR' ? amount * 2 : amount }),
    ),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CashFlowSimulationService', () => {
  const liquidAccountId = 'cash-1';
  const liquidAccount = {
    id: liquidAccountId,
    name: 'Main Savings',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  } as any;
  const expenseAccount = {
    id: 'exp-eating',
    name: 'Eating Out Expense',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs a basic simulation with starting balance and no flows', async () => {
    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [],
      [],
      [liquidAccountId],
      [],
      [],
      [],
      [liquidAccount],
      'USD',
    );

    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1000);
    expect(result.simulationResult.projections[0].globalBalance).toBe(1000);
  });

  it('handles simple OUTFLOW correctly', async () => {
    const plannedPayment = {
      id: 'pp-1',
      name: 'Rent',
      fromAccountId: liquidAccountId,
      toAccountId: 'landlord',
      amount: 400,
      nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [plannedPayment],
      [],
      [liquidAccountId],
      [],
      [],
      [],
      [liquidAccount],
      'USD',
    );

    // Initial 1000, Day 5 (offset 4) - 400 = 600
    // Simulation window is 30 days
    expect(result.simulationResult.summary.safeToSpend).toBe(600);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(600);
  });

  it('handles TRANSFER between liquid accounts correctly (net zero)', async () => {
    const otherAccountId = 'bank-2';
    const otherAccount = {
      id: otherAccountId,
      name: 'Bank 2',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    } as any;

    const plannedTransfer = {
      id: 'pp-trans',
      name: 'Internal Transfer',
      fromAccountId: liquidAccountId,
      toAccountId: otherAccountId,
      amount: 500,
      nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    const result = await cashFlowSimulationService.simulate(
      new Map([
        [liquidAccountId, 1000],
        [otherAccountId, 0],
      ]),
      [plannedTransfer],
      [],
      [liquidAccountId, otherAccountId],
      [],
      [],
      [],
      [liquidAccount, otherAccount],
      'USD',
    );

    // Global balance should remain 1000
    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1000);

    // Check internal per-account state at end of simulation
    const lastDay =
      result.simulationResult.projections[result.simulationResult.projections.length - 1];
    expect(lastDay.accountBalances?.get(liquidAccountId)).toBe(500);
    expect(lastDay.accountBalances?.get(otherAccountId)).toBe(500);
  });

  it('handles Budget burns as OUTFLOWs', async () => {
    const budget = {
      id: 'b-1',
      name: 'Eating Out',
      amount: 300,
      assetAccountIds: liquidAccountId,
    } as any;
    const usage = {
      remaining: 300,
    } as any;
    const expenseAccount = {
      id: 'exp-eating',
      accountType: AccountType.EXPENSE,
    } as any;
    budgetRepository.getScopes = jest.fn().mockResolvedValue([{ account: expenseAccount }]);

    budgetRepository.getScopes = jest.fn().mockResolvedValue([{ account: expenseAccount }]);

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [],
      [],
      [liquidAccountId],
      [],
      [budget],
      [usage],
      [liquidAccount],
      'USD',
    );

    // 300 over 30 days = 10/day.
    // Total burn in 30 days window = 300.
    // Safe to spend = 1000 - 300 = 700.
    expect(result.simulationResult.summary.safeToSpend).toBe(700);
  });

  it('normalizes planned journal transactions from other currencies before charging the flow', async () => {
    const journalTx = {
      id: 'tx-eur',
      journalId: 'pj-eur',
      accountId: liquidAccountId,
      amount: 100,
      currencyCode: 'EUR',
      transactionType: TransactionType.CREDIT,
    } as Transaction;
    const findByJournalsMock = transactionRepository.findByJournals as jest.MockedFunction<
      typeof transactionRepository.findByJournals
    >;
    findByJournalsMock.mockResolvedValueOnce([journalTx]);

    const plannedJournal = {
      id: 'pj-eur',
      description: 'Euro payment',
      journalDate: dayjs('2026-04-03T12:00:00Z').valueOf(),
    } as any;

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [],
      [plannedJournal],
      [liquidAccountId],
      [],
      [],
      [],
      [liquidAccount, expenseAccount],
      'USD',
    );

    expect(result.simulationResult.summary.safeToSpend).toBe(800);
  });

  it('handles Credit Card obligations with manual payments', async () => {
    const ccId = 'cc-1';
    const ccAccount = {
      id: ccId,
      name: 'CC',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'USD',
      metadataRecords: { fetch: jest.fn().mockResolvedValue([{ statementDay: 5, dueDay: 20 }]) },
    } as any;

    const plannedPayment = {
      id: 'pp-cc',
      name: 'CC Payment',
      fromAccountId: liquidAccountId,
      toAccountId: ccId,
      amount: 200, // Partial payment
      nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    // Mock repository: Statement Balance = 500
    transactionRawRepository.getLatestBalancesRaw = jest
      .fn()
      .mockResolvedValue(new Map([[ccId, 500]]));

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [plannedPayment],
      [],
      [liquidAccountId],
      [{ account: ccAccount, balance: 500 }],
      [],
      [],
      [liquidAccount, ccAccount],
      'USD',
    );

    // CC starting balance 500.
    // Planned payment of 200 arrives on D10 (TRANSFER).
    // Remaining obligation = 500 - 200 = 300.
    // 300 OUTFLOW on D20 (due date).

    // Total impact on liquid account:
    // D10: -200 (Transfer to CC)
    // D20: -300 (Remaining Obligation payment)
    // Total = -500.
    // Safe to spend = 1000 - 500 = 500.
    expect(result.simulationResult.summary.safeToSpend).toBe(500);
  });

  it('Planned payment overrides Budget burn for its category (Option A)', async () => {
    const expenseId = 'exp-rent';
    const expenseAccount = {
      id: expenseId,
      name: 'Rent Expense',
      accountType: AccountType.EXPENSE,
    } as any;

    const budget = {
      id: 'b-rent',
      name: 'Rent Budget',
      amount: 1000,
      assetAccountIds: liquidAccountId,
    } as any;
    const usage = {
      remaining: 1000,
    } as any;

    // Planned payment for the SAME category on D10
    const plannedPayment = {
      id: 'pp-rent',
      name: 'Monthly Rent',
      fromAccountId: liquidAccountId,
      toAccountId: expenseId,
      amount: 400,
      nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    // Mock budget repository to return the expense scope
    budgetRepository.getScopes = jest.fn().mockResolvedValue([{ account: expenseAccount }]);

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 2000]]),
      [plannedPayment],
      [],
      [liquidAccountId],
      [],
      [budget],
      [usage],
      [liquidAccount, expenseAccount],
      'USD',
    );

    // Initial 2000.
    // Daily burn: 1000 / 30 = 33.33.
    // D10 (offset 9) has a planned payment of 400.
    // The Resolver will take max(33.33, 400) = 400 for D10.

    // Check flows
    const budgetFlows = result.allFlows!.filter((f: any) => f.meta?.source === 'BUDGET');
    const plannedFlows = result.allFlows!.filter((f: any) => f.meta?.source === 'PLANNED');
    const resolvedFlows = result.allFlows!.filter((f: any) => f.meta?.source === 'RESOLVED');

    // Should have 29 budget flows (non-conflicting days)
    expect(budgetFlows.length).toBe(29);
    // Planned flow on D10 was resolved against the budget burn
    expect(plannedFlows.length).toBe(0);
    // Should have 1 resolved flow for D10
    expect(resolvedFlows.length).toBe(1);
    expect(resolvedFlows[0].amount).toBe(400);

    // Safe to spend calculation:
    // Starting 2000
    // Budget burn (29 days): 29 * 33.33... = 966.66...
    // Resolved burn (D10): 400
    // Total: 2000 - 966.66 - 400 = 633.33
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(633.33, 1);
  });

  it('handles INFLOW to liability accounts correctly (external payment)', async () => {
    const ccId = 'cc-ext';
    const ccAccount = {
      id: ccId,
      name: 'CC Ext',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'USD',
      metadataRecords: { fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15 }]) },
    } as any;

    // Planned INFLOW to the CC (e.g. refund or payment from untracked account)
    const plannedInflow = {
      id: 'pp-refund',
      name: 'Refund',
      fromAccountId: 'external',
      toAccountId: ccId,
      amount: 100,
      nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    // Mock repository:
    // Statement Balance = 500
    // Settled = 0
    transactionRawRepository.getLatestBalancesRaw = jest
      .fn()
      .mockResolvedValue(new Map([[ccId, 500]]));
    transactionRawRepository.getAccountPeriodMetricsRaw = jest
      .fn()
      .mockResolvedValue({ totalDecrease: 0, totalIncrease: 0 });

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [plannedInflow],
      [],
      [liquidAccountId],
      [{ account: ccAccount, balance: 500 }],
      [],
      [],
      [liquidAccount, ccAccount],
      'USD',
    );

    // CC starting balance 500.
    // INFLOW of 100 on D5.
    // Remaining obligation = 500 - 100 = 400.
    // 400 OUTFLOW on D15 (due date).

    // Total impact on liquid account:
    // D15: -400 (Bill payment)
    // (The INFLOW was from 'external', so it didn't hit 'liquidAccountId')

    // Safe to spend = 1000 - 400 = 600.
    expect(result.simulationResult.summary.safeToSpend).toBe(600);

    // Verify exactly one output flow (the liability settlement)
    const liabilityFlows = result.allFlows!.filter((f: any) => f.meta?.source === 'LIABILITY');

    expect(liabilityFlows.length).toBe(1);
    expect(liabilityFlows[0].amount).toBe(400);
  });

  it('subtracts already-settled payments from the future obligation', async () => {
    const ccId = 'cc-settled';
    const ccAccount = {
      id: ccId,
      name: 'CC Settled',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'USD',
      metadataRecords: { fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15 }]) },
    } as any;

    // Mock repository:
    // 1. Statement Balance = 500
    // 2. Already settled since statement date = 200
    transactionRawRepository.getLatestBalancesRaw = jest
      .fn()
      .mockResolvedValue(new Map([[ccId, 500]]));
    transactionRawRepository.getAccountPeriodMetricsRaw = jest
      .fn()
      .mockResolvedValue({ totalDecrease: 200, totalIncrease: 0 });

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [],
      [],
      [liquidAccountId],
      [{ account: ccAccount, balance: 800 }], // Current balance 800
      [],
      [],
      [liquidAccount, ccAccount],
      'USD',
    );

    // Calculation:
    // Statement = 500
    // Settled = 200
    // Remaining Statement = 500 - 200 = 300.
    // Current Balance = 800.
    // Bill 1 (Due D15) = min(800, 300) = 300.
    // Bill 2 (Due D45 - outside window) = max(0, 800 - 300) = 500.

    // Result flows: exactly one LIABILITY flow of 300 on D15.
    const liabilityFlows = result.allFlows!.filter((f: any) => f.meta?.source === 'LIABILITY');

    expect(liabilityFlows.length).toBe(1);
    expect(liabilityFlows[0].amount).toBe(300);
    expect(result.simulationResult.summary.safeToSpend).toBe(700); // 1000 - 300
  });

  it('deduplicates PlannedPayment template against existing Journals', async () => {
    const ppId = 'pp-dedup';
    const nextOcc = dayjs('2026-04-05T12:00:00Z').valueOf();

    const plannedPayment = {
      id: ppId,
      name: 'Monthly Rent',
      fromAccountId: liquidAccountId,
      toAccountId: 'landlord',
      amount: 1000,
      nextOccurrence: nextOcc,
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    } as any;

    // Journal that concretizes the April 5th payment
    const journal = {
      id: 'j-rent-april',
      description: 'Monthly Rent (April)',
      journalDate: nextOcc,
      plannedPaymentId: ppId,
      status: 'PLANNED',
    } as any;

    const journalTxs = [
      { accountId: liquidAccountId, transactionType: 'CREDIT', amount: 1000 },
      { accountId: 'landlord', transactionType: 'DEBIT', amount: 1000 },
    ];

    // Mock journal transactions
    transactionRepository.findByJournals = jest
      .fn()
      .mockResolvedValue(journalTxs.map(tx => ({ ...tx, journalId: journal.id })));

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 5000]]),
      [plannedPayment],
      [journal],
      [liquidAccountId],
      [],
      [],
      [],
      [liquidAccount],
      'USD',
    );

    // Initial 5000.
    // April 5 occurrence: Covered by Journal (-1000). Template SHOULD BE SKIPPED.
    // May 5 occurrence: Outside 30-day window.

    // Total impact: -1000.
    // Safe to spend: 4000.
    expect(result.simulationResult.summary.safeToSpend).toBe(4000);

    const allPlannedFlows = result.allFlows!.filter((f: any) => f.meta?.source === 'PLANNED');

    // Exactly 1 flow total for this PP
    expect(allPlannedFlows.length).toBe(1);
    expect(allPlannedFlows[0].label).toBe('Monthly Rent (April)'); // From Journal
  });

  it('pulls forward overdue payments to the simulation start date', async () => {
    // Today is April 1st.
    // Payment was due March 25th (offset -7).
    const overdueOcc = dayjs('2026-03-25T12:00:00Z').valueOf();

    const plannedPayment = {
      id: 'pp-overdue',
      name: 'Overdue Bill',
      fromAccountId: liquidAccountId,
      toAccountId: 'utility',
      amount: 150,
      nextOccurrence: overdueOcc,
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
      status: 'ACTIVE',
    } as any;

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [plannedPayment],
      [],
      [liquidAccountId],
      [],
      [],
      [],
      [liquidAccount],
      'USD',
    );

    // Should generate a flow for "today" (offset 0) even though it was due in the past
    const plannedFlows = result.allFlows!.filter((f: any) => f.meta?.referenceId === 'pp-overdue');

    // It should have two flows in the 30 day window:
    // 1. Overdue (now due April 1)
    // 2. Next occurrence (April 25)
    expect(plannedFlows.length).toBe(2);
    expect(plannedFlows[0].dayOffset).toBe(0);
    expect(plannedFlows[1].dayOffset).toBe(24); // 25th - 1st = 24
  });

  it('respects PlannedPayment endDate and stops projecting', async () => {
    // Today is April 1st.
    // Payment due April 5th.
    // End date is April 10th.
    const plannedPayment = {
      id: 'pp-ending',
      name: 'Temp Subscription',
      fromAccountId: liquidAccountId,
      toAccountId: 'service',
      amount: 20,
      nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
      endDate: dayjs('2026-04-10T23:59:59Z').valueOf(),
      intervalType: 'DAILY',
      intervalN: 1,
      currencyCode: 'USD',
      status: 'ACTIVE',
    } as any;

    const result = await cashFlowSimulationService.simulate(
      new Map([[liquidAccountId, 1000]]),
      [plannedPayment],
      [],
      [liquidAccountId],
      [],
      [],
      [],
      [liquidAccount],
      'USD',
    );

    // Should project for 5th, 6th, 7th, 8th, 9th, 10th.
    // Total 6 flows.
    const plannedFlows = result.allFlows!.filter((f: any) => f.meta?.referenceId === 'pp-ending');

    expect(plannedFlows.length).toBe(6);
    expect(plannedFlows[plannedFlows.length - 1].dayOffset).toBe(9); // April 10th
  });
});
