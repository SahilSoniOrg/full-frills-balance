import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import { Money } from '@/src/utils/money';
import dayjs from 'dayjs';

jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CashFlowSimulationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-08T00:00:00.000Z'));
    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses only the credit card statement due in the window for safe-to-spend', async () => {
    const creditCard = {
      id: 'cc-1',
      name: 'Primary Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([{ statementDay: 5, dueDay: 20 }]),
      },
    } as unknown as Account;

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([[creditCard.id, -250]]),
    );

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      Money.from(1000, 'USD'),
      [],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: Money.from(400, 'USD') }],
      [],
      [],
      [],
      [],
      'USD',
    );

    expect(result.totalLiabilities).toBe(400);
    expect(result.committedLiabilities).toBe(250);
    expect(result.committedLiabilitiesCC).toBe(250);
    expect(result.totalLiabilitiesCC).toBe(400);
    expect(result.safeToSpend).toBe(750);
  });

  it('correctly commits statement balance when today is before the due date', async () => {
    // Today is March 2nd.
    // Last statement was Feb 15th.
    // Due date is March 5th.
    jest.setSystemTime(new Date('2026-03-02T00:00:00.000Z'));

    const creditCard = {
      id: 'cc-1',
      name: 'Primary Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([{ statementDay: 15, dueDay: 5 }]),
      },
    } as unknown as Account;

    // Current balance is 1000.
    // Balance on Feb 15th (last statement) was 600.
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockImplementation((_, cutoff) => {
      const feb15 = dayjs('2026-02-15').valueOf();
      if (cutoff === feb15) return Promise.resolve(new Map([[creditCard.id, -600]]));
      return Promise.resolve(new Map());
    });

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      Money.from(2000, 'USD'),
      [],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: Money.from(1000, 'USD') }],
      [],
      [],
      [],
      [],
      'USD',
    );

    // Expected: $600 is due on March 5th (since today is March 2nd and Due is 5th).
    // Current code would likely set targetDueDate to April 5th because today (2) <= statementDay (15).
    // And it would use the current balance (1000) instead of statement balance (600).

    expect(result.committedLiabilitiesCC).toBe(600);
    // The remaining 400 would be due on April 5th (beyond simulation window if it's 30 days, but let's check committed)
    // Wait, simulation window is 30 days. March 2 + 30 days = April 1.
    // April 5 is outside. So only the 600 should be committed.
  });

  it('tracks manual liability payments as commitments without subtracting the whole balance twice', async () => {
    const creditCard = {
      id: 'cc-1',
      name: 'Primary Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([{ statementDay: 5, dueDay: 20 }]),
      },
    } as unknown as Account;

    const plannedPayment = {
      id: 'pp-1',
      name: 'Card payment',
      fromAccountId: 'cash-1',
      toAccountId: creditCard.id,
      amount: 300,
      nextOccurrence: dayjs().add(2, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      Money.from(1000, 'USD'),
      [plannedPayment as any],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: Money.from(400, 'USD') }],
      [],
      [],
      [],
      [],
      'USD',
    );

    expect(result.totalLiabilities).toBe(400);
    expect(result.committedLiabilities).toBe(300);
    expect(result.committedLiabilitiesCC).toBe(300);
    expect(result.safeToSpend).toBe(1000); // 1000 - 0 (internal transfer)
  });
  it('treats planned income to a liability account as an inflow', async () => {
    const creditCard = {
      id: 'cc-1',
      name: 'Primary Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([{ statementDay: 5, dueDay: 20 }]),
      },
    } as unknown as Account;

    const plannedIncome = {
      id: 'pp-income',
      name: 'Side Project Income',
      fromAccountId: 'external-source',
      toAccountId: creditCard.id,
      amount: 500,
      nextOccurrence: dayjs().add(5, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([[creditCard.id, -250]]),
    );

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      Money.from(1000, 'USD'),
      [plannedIncome as any],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: Money.from(400, 'USD') }],
      [],
      [],
      [],
      [],
      'USD',
    );

    expect(result.totalFutureInflow).toBe(500);
    expect(result.safeToSpend).toBe(1000); // 1000 (starting balance) is the floor, income only raises it above
  });

  it('does not include future income in safe-to-spend (conservative logic)', async () => {
    const plannedIncome = {
      id: 'pp-income',
      name: 'Salary',
      fromAccountId: 'employer',
      toAccountId: 'cash-1', // Directly to liquid asset
      amount: 1000,
      nextOccurrence: dayjs().add(5, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const plannedExpense = {
      id: 'pp-expense',
      name: 'Rent',
      fromAccountId: 'cash-1',
      toAccountId: 'landlord',
      amount: 800,
      nextOccurrence: dayjs().add(10, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      Money.from(1000, 'USD'),
      [plannedIncome as any, plannedExpense as any],
      [],
      ['cash-1'],
      [],
      [],
      [],
      [],
      [],
      'USD',
    );

    // Trajectory would be: 1000 -> (D5) 2000 -> (D10) 1200. Min = 1000.
    // Dynamic Buffer: min(1000, 1000) = 1000.
    expect(result.safeToSpend).toBe(1000);
    expect(result.trajectoryMinBalance).toBe(1000);
  });

  it('buffers future outflows with income only if income arrives first', async () => {
    const plannedExpense = {
      id: 'pp-expense',
      name: 'Rent',
      fromAccountId: 'cash-1',
      toAccountId: 'landlord',
      amount: 800,
      nextOccurrence: dayjs().add(5, 'day').valueOf(), // Bill FIRST
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const plannedIncome = {
      id: 'pp-income',
      name: 'Salary',
      fromAccountId: 'employer',
      toAccountId: 'cash-1',
      amount: 1000,
      nextOccurrence: dayjs().add(10, 'day').valueOf(), // Income LATER
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      Money.from(1000, 'USD'),
      [plannedIncome as any, plannedExpense as any],
      [],
      ['cash-1'],
      [],
      [],
      [],
      [],
      [],
      'USD',
    );

    // Trajectory: 1000 -> (D5) 200 -> (D10) 1200. Min = 200.
    // Safe to Spend = min(1000, 200) = 200.
    expect(result.safeToSpend).toBe(200);
  });

  test('implements smoothed budget burn over 30 days', async () => {
    jest.setSystemTime(new Date('2026-03-20T00:00:00.000Z'));
    const expenseAcc = { id: 'exp-1', name: 'Food', accountType: AccountType.EXPENSE } as any;
    const budget = {
      id: 'b-1',
      name: 'Food Budget',
      amount: 600,
      scopes: { fetch: jest.fn().mockResolvedValue([{ account: expenseAcc }]) },
    } as any;
    const usage = {
      budget,
      remaining: 300,
    } as any;

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      Money.from(1000, 'USD'),
      [],
      [],
      ['cash-1'],
      [],
      [budget],
      [usage],
      [[{ account: expenseAcc }]],
      [expenseAcc, { id: 'cash-1', accountType: AccountType.ASSET } as any],
      'USD',
    );

    // Calculation:
    // March (current): $300 remaining. Days left: 12 (Mar 20, 21, ..., 31).
    // April (next): $600 / 30 = $20/day.
    // Simulation Window (30 days):
    // 12 days of March @ (implied) $300 total.
    // 18 days of April @ $20/day = $360.
    // Total in window = 300 + 360 = $660.
    // Smoothed daily burn = 660 / 30 = $22/day.

    // Final trajectory min balance: 1000 - 660 = 340.
    // Safe to Spend: min(1000, 340) = 340.

    expect(result.committedBudget).toBe(660);
    expect(result.safeToSpend).toBe(340);
  });
});
