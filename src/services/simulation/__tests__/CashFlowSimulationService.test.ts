import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { FlowSource } from '@/src/services/simulation/types';
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
    getScopesByBudgetIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/data/repositories/AccountRepository', () => ({
  accountRepository: {
    findMetadataByAccountIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    convert: jest.fn((amount: number, from?: string) =>
      Promise.resolve({ convertedAmount: from === 'EUR' ? amount * 2 : amount }),
    ),
    fetchRatesForBase: jest.fn().mockResolvedValue({}),
    getRateSafe: jest.fn((from?: string) => (from === 'EUR' ? 2 : 1)),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    metric: jest.fn(),
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
      'test-wp',
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
      'test-wp',
    );

    // Initial 1000.
    // Occurrence 1: Day 5 (offset 4) - 400 = 600
    // Occurrence 2: Day 35 (offset 34) - 400 = 200 (since 60-day window)
    expect(result.simulationResult.summary.safeToSpend).toBe(200);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(200);
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
      'test-wp',
    );

    // Global balance should remain 1000
    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1000);

    // Month 1 (D10): Transfer 500 (liquid: 500, other: 500)
    // Month 2 (D40): Transfer 500 (liquid: 0, other: 1000)
    const lastDay =
      result.simulationResult.projections[result.simulationResult.projections.length - 1];
    expect(lastDay.accountBalances?.get(liquidAccountId)).toBe(0);
    expect(lastDay.accountBalances?.get(otherAccountId)).toBe(1000);
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
    const budgetId = budget.id;
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId, accountId: expenseAccount.id, account: expenseAccount },
    ]);

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
      'test-wp',
    );

    // Budget is 300/month.
    // April (30 days): 300.
    // May (31 days): burn for 30 days = 300 * 30/31 = 290.32.
    // Total burn in 60-day window = 590.32.
    // Safe to spend = 1000 - 590.32 = 409.68.
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(409.68, 1);
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
      'test-wp',
    );

    // Initial 1000.
    // Journal on D3: -100 USD (from 100 EUR @ 1:2 rate).
    // PlannedPayment (if it repeats): wait, it's a journal, it doesn't repeat automatically in simulation (only PP templates do).
    // So 1000 - 200 = 800.
    // Wait, 100 EUR * 2 = 200 USD. 1000 - 200 = 800. Correct.
    expect(result.simulationResult.summary.safeToSpend).toBe(800);
  });

  it('handles Credit Card obligations with manual payments', async () => {
    const ccId = 'cc-1';
    const ccAccount = {
      id: ccId,
      name: 'CC',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      metadataRecords: { fetch: jest.fn().mockResolvedValue([{ statementDay: 5, dueDay: 20 }]) }, // Still used for legacy/internal purposes
    } as any;

    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
      { accountId: ccId, statementDay: 5, dueDay: 20 },
    ]);

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
      'test-wp',
    );

    // CC starting balance 500.
    // PP: -200 on D10, -200 on D40 (if monthly).
    // Liability: -300 on D20. (Remaining obligation for first statement).
    // Since CC balance isn't projected to grow (no other outflows to CC), no further obligation.
    // Total Outflow: 200 (D10) + 300 (D20) + 200 (D40) = 700.
    // Safe to spend: 1000 - 700 = 300.
    expect(result.simulationResult.summary.safeToSpend).toBe(300);
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
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: budget.id, accountId: expenseAccount.id, account: expenseAccount },
    ]);

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
      'test-wp',
    );

    // Initial 2000.
    // Daily burn: 1000 / safeToSpendDays.
    // D10 (offset 9) has a planned payment of 400.
    // The Resolver will take max(burn, 400) for D10.

    // Check flows
    // Check flows
    const budgetFlows = result.allFlows!.filter(
      (f: any) => f.origin === FlowSource.BUDGET && f.resolvedFrom === undefined,
    );
    const plannedFlows = result.allFlows!.filter(
      (f: any) =>
        (f.origin === FlowSource.PLANNED_PAYMENT || f.origin === FlowSource.PLANNED_JOURNAL) &&
        f.resolvedFrom === undefined,
    );
    const resolvedFlows = result.allFlows!.filter((f: any) => f.resolvedFrom !== undefined);

    // Should have 58 budget flows (non-conflicting days in 60-day window)
    expect(budgetFlows.length).toBe(58);
    // Planned flows on D10 and D40 were resolved against the budget burn
    expect(plannedFlows.length).toBe(0);
    // Should have 2 resolved flows (D10, D40)
    expect(resolvedFlows.length).toBe(2);
    expect(resolvedFlows[0].amount).toBe(400);
    expect(resolvedFlows[1].amount).toBe(400);

    // Initial 2000.
    // Exact calculation accounts for month lengths (April 30, May 31).
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(58.71, 1);
  });

  it('handles INFLOW to liability accounts correctly (external payment)', async () => {
    const ccId = 'cc-ext';
    const ccAccount = {
      id: ccId,
      name: 'CC Ext',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      metadataRecords: { fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15 }]) },
    } as any;

    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
      { accountId: ccId, statementDay: 1, dueDay: 15 },
    ]);

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
      'test-wp',
    );

    // CC starting balance 500.
    // INFLOW of 100 on D5, and D35 (if monthly).
    // Obligation 1 (D15): 500 - 100 = 400.
    // Obligation 2 (D45): Since CC balance is now ~0 (from start of 500 - 400 payment - 100 refund), no further obligation.
    // Wait, the CC balance is tracked.
    // Total OUTFLOW: 400 on D15.
    // Safe to spend = 1000 - 400 = 600.
    expect(result.simulationResult.summary.safeToSpend).toBe(600);

    // Verify exactly one output flow (the liability settlement)
    const liabilityFlows = result.allFlows!.filter((f: any) => f.origin === FlowSource.LIABILITY);

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
      metadataRecords: { fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15 }]) },
    } as any;

    (accountRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
      { accountId: ccId, statementDay: 1, dueDay: 15 },
    ]);

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
      'test-wp',
    );

    // Calculation:
    // Statement = 500. Settled = 200. Remaining = 300.
    // Bill 1 (Due D15) = 300.
    // Bill 2 (Due D45) = 500.
    // Total Outflow = 300 + 500 = 800.
    // Safe to spend = 1000 - 800 = 200.
    expect(result.simulationResult.summary.safeToSpend).toBe(200);
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
      'test-wp',
    );

    // Initial 5000.
    // April 5 occurrence: Covered by Journal (-1000). Template SHOULD BE SKIPPED.
    // May 5 occurrence: Covered by Template (-1000).
    // Total impact: -2000.
    // Safe to spend: 3000.
    expect(result.simulationResult.summary.safeToSpend).toBe(3000);

    const allPlannedFlows = result.allFlows!.filter(
      (f: any) =>
        f.origin === FlowSource.PLANNED_PAYMENT || f.origin === FlowSource.PLANNED_JOURNAL,
    );

    // Exactly 2 flows total for this PP (1 from Journal, 1 from Template)
    expect(allPlannedFlows.length).toBe(2);
    expect(allPlannedFlows[0].label).toBe('Monthly Rent (April)'); // From Journal
    expect(allPlannedFlows[1].label).toBe('Monthly Rent'); // From Template
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
      'test-wp',
    );

    // Should generate a flow for "today" (offset 0) even though it was due in the past
    const plannedFlows = result.allFlows!.filter((f: any) => f.referenceId === 'pp-overdue');

    // It should have three flows in the window:
    // 1. Overdue (now due April 1)
    // 2. Next occurrence (April 25)
    // 3. May occurrence (May 25)
    expect(plannedFlows.length).toBe(3);
    expect(plannedFlows[0].dayOffset).toBe(0);
    expect(plannedFlows[1].dayOffset).toBe(24);
    expect(plannedFlows[2].dayOffset).toBe(54);
    expect(result.simulationResult.summary.safeToSpend).toBe(1000 - 150 * 3);
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
      'test-wp',
    );

    // Should project for 5th, 6th, 7th, 8th, 9th, 10th.
    // 5 occurrences (April 5, 6, 7, 8, 9, 10)
    // Actually April 5th to April 10th inclusive = 6 days.
    const flows = result.allFlows!.filter(
      (f: any) => f.referenceId === 'pp-ending' || f.meta?.referenceId === 'pp-ending',
    );
    expect(flows.length).toBe(6);
    expect(flows[flows.length - 1].dayOffset).toBe(9); // April 10th
  });
});
