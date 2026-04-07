import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';

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
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-08T00:00:00.000Z'));

    // Re-import mocks and service after resetModules
    const { transactionRepository } = require('@/src/data/repositories/TransactionRepository');
    const {
      transactionRawRepository,
    } = require('@/src/data/repositories/TransactionRawRepository');

    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.useRealTimers();
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
      new Map([['cash-1', 2000]]),
      [],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 1000 }],
      [],
      [],
      [],
      [],
      'USD',
    );

    // Expected: $600 is due on March 5th (since today is March 2nd and Due is 5th).
    expect(result.breakdowns.liabilities.committedCreditCard).toBe(600);
    expect(result).toMatchSnapshot();
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
      new Map([['cash-1', 1000]]),
      [],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 400 }],
      [],
      [],
      [],
      [],
      'USD',
    );

    expect(result.breakdowns.liabilities.total).toBe(400);
    expect(result.breakdowns.liabilities.committed).toBe(250);
    expect(result.breakdowns.liabilities.committedCreditCard).toBe(250);
    expect(result.breakdowns.liabilities.totalCreditCard).toBe(400);
    expect(result.summary.safeToSpend).toBe(750);
    expect(result).toMatchSnapshot();
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
      new Map([['cash-1', 1000]]),
      [plannedPayment as any],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 400 }],
      [],
      [],
      [],
      [],
      'USD',
    );
    expect(result.breakdowns.liabilities.total).toBe(400);
    expect(result.breakdowns.liabilities.committed).toBe(0);
    expect(result.breakdowns.liabilities.committedCreditCard).toBe(0);
    expect(result.breakdowns.committed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 300,
          accountId: creditCard.id,
        }),
      ]),
    );
    expect(result.summary.safeToSpend).toBe(700); // 1000 - 300 (internal transfer)
    expect(result).toMatchSnapshot();
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
      new Map([['cash-1', 1000]]),
      [plannedIncome as any],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 400 }],
      [],
      [],
      [],
      [],
      'USD',
    );

    expect(result.summary.totalFutureInflow).toBe(500);
    expect(result.summary.safeToSpend).toBe(1000); // 1000 (starting balance) is the floor, income only raises it above
    expect(result).toMatchSnapshot();
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
      new Map([['cash-1', 1000]]),
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
    expect(result.summary.safeToSpend).toBe(1000);
    expect(result.summary.trajectoryMinBalance).toBe(1000);
    expect(result).toMatchSnapshot();
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
      new Map([['cash-1', 1000]]),
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
    expect(result.summary.safeToSpend).toBe(200);
    expect(result).toMatchSnapshot();
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
      new Map([['cash-1', 1000]]),
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

    expect(
      result.breakdowns.budget.currentMonthRemaining + result.breakdowns.budget.nextMonthProjected,
    ).toBe(660);
    expect(result.summary.safeToSpend).toBe(340);
    expect(result).toMatchSnapshot();
  });

  it('does not double count planned outflows covered by budget', async () => {
    // Both Budget and Planned Payment cover the same expense account.
    // Balance = 1000.
    // Budget Burn matches = $20 / day
    // Planned Payment hits today = $15
    // The $15 planned payment MUST be "absorbed" by the $20 daily burn, leading to only $20 deducted from today's simulation, NOT $35.

    jest.setSystemTime(new Date('2026-03-20T00:00:00.000Z'));
    const expenseAcc = {
      id: 'exp-covered',
      name: 'Utilities',
      accountType: AccountType.EXPENSE,
    } as any;

    const plannedExpense = {
      id: 'pp-util',
      name: 'Electric Bill',
      fromAccountId: 'cash-1',
      toAccountId: expenseAcc.id,
      amount: 15,
      nextOccurrence: dayjs().valueOf(), // Today
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const budget = {
      id: 'b-util',
      name: 'Utility Budget',
      amount: 600,
      scopes: { fetch: jest.fn().mockResolvedValue([{ account: expenseAcc }]) },
    } as any;

    const usage = {
      budget,
      remaining: 600, // 30 days left roughly, so $20/day burn
    } as any;

    const result = await cashFlowSimulationService.simulateSafeToSpend(
      new Map([['cash-1', 1000]]),
      [plannedExpense as any],
      [],
      ['cash-1'],
      [],
      [budget],
      [usage],
      [[{ account: expenseAcc }]],
      [expenseAcc, { id: 'cash-1', accountType: AccountType.ASSET } as any],
      'USD',
    );

    // Baseline calculation check:
    // With 15 planned covered by 50 budget burn on day 0, day 0 deduction = 50 (not 65).
    // The Safe to spend math over 30 days reduces the balance linearly by $50/day in March ($600 total) and $20/day in April ($360).
    // Final safe to spend: 1000 - 960 = 40.
    expect(Math.round(result.summary.safeToSpend)).toBe(40);
    expect(result).toMatchSnapshot();
  });
});
