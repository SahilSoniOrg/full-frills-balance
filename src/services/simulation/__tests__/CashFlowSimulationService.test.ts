import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { CashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';

import dayjs from 'dayjs';

jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/data/repositories/BudgetRepository');
jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CashFlowSimulationService', () => {
  let cashFlowSimulationService: CashFlowSimulationService;

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
    const { budgetRepository } = require('@/src/data/repositories/BudgetRepository');
    const {
      CashFlowSimulationService,
    } = require('@/src/services/simulation/CashFlowSimulationService');

    cashFlowSimulationService = new CashFlowSimulationService();

    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    (transactionRawRepository.getAccountPeriodMetricsRaw as jest.Mock).mockResolvedValue({
      totalDecrease: 0,
    });
    (budgetRepository.getScopes as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('correctly commits statement balance when today is before the due date', async () => {
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

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockImplementation((_, cutoff) => {
      const feb15 = dayjs('2026-02-15').valueOf();
      if (cutoff === feb15) return Promise.resolve(new Map([[creditCard.id, -600]]));
      return Promise.resolve(new Map());
    });

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 2000]]),
      [],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 1000 }],
      [],
      [],
      [],
      'USD',
    );

    expect(result.breakdowns.liabilities.committedCreditCard).toBe(600);
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

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 1000]]),
      [],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 400 }],
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

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 1000]]),
      [plannedPayment as any],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 400 }],
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
    expect(result.summary.safeToSpend).toBe(700);
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

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 1000]]),
      [plannedIncome as any],
      [],
      ['cash-1'],
      [{ account: creditCard, balance: 400 }],
      [],
      [],
      [],
      'USD',
    );

    expect(result.summary.totalFutureInflow).toBe(500);
    expect(result.summary.safeToSpend).toBe(1000);
  });

  it('does not include future income in safe-to-spend', async () => {
    const plannedIncome = {
      id: 'pp-income',
      fromAccountId: 'employer',
      toAccountId: 'cash-1',
      amount: 1000,
      nextOccurrence: dayjs().add(5, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const plannedExpense = {
      id: 'pp-expense',
      fromAccountId: 'cash-1',
      toAccountId: 'landlord',
      amount: 800,
      nextOccurrence: dayjs().add(10, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 1000]]),
      [plannedIncome as any, plannedExpense as any],
      [],
      ['cash-1'],
      [],
      [],
      [],
      [],
      'USD',
    );

    expect(result.summary.safeToSpend).toBe(1000);
    expect(result.summary.trajectoryMinBalance).toBe(1000);
  });

  it('buffers future outflows with income only if income arrives first', async () => {
    const plannedExpense = {
      id: 'pp-expense',
      fromAccountId: 'cash-1',
      toAccountId: 'landlord',
      amount: 800,
      nextOccurrence: dayjs().add(5, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const plannedIncome = {
      id: 'pp-income',
      fromAccountId: 'employer',
      toAccountId: 'cash-1',
      amount: 1000,
      nextOccurrence: dayjs().add(10, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 1000]]),
      [plannedIncome as any, plannedExpense as any],
      [],
      ['cash-1'],
      [],
      [],
      [],
      [],
      'USD',
    );

    expect(result.summary.safeToSpend).toBe(200);
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

    (budgetRepository.getScopes as jest.Mock).mockResolvedValue([{ account: expenseAcc }]);

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 1000]]),
      [],
      [],
      ['cash-1'],
      [],
      [budget],
      [usage],
      [expenseAcc, { id: 'cash-1', accountType: AccountType.ASSET } as any],
      'USD',
    );

    expect(
      result.breakdowns.budget.currentMonthRemaining + result.breakdowns.budget.nextMonthProjected,
    ).toBe(660);
    expect(result.summary.safeToSpend).toBe(340);
  });

  it('does not double count planned outflows covered by budget', async () => {
    jest.setSystemTime(new Date('2026-03-20T00:00:00.000Z'));
    const expenseAcc = {
      id: 'exp-covered',
      name: 'Utilities',
      accountType: AccountType.EXPENSE,
    } as any;

    const plannedExpense = {
      id: 'pp-util',
      fromAccountId: 'cash-1',
      toAccountId: expenseAcc.id,
      amount: 15,
      nextOccurrence: dayjs().valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    const budget = {
      id: 'b-util',
      amount: 600,
    } as any;

    const usage = {
      budget,
      remaining: 600,
    } as any;

    (budgetRepository.getScopes as jest.Mock).mockResolvedValue([{ account: expenseAcc }]);

    const result = await cashFlowSimulationService.simulate(
      new Map([['cash-1', 1000]]),
      [plannedExpense as any],
      [],
      ['cash-1'],
      [],
      [budget],
      [usage],
      [expenseAcc, { id: 'cash-1', accountType: AccountType.ASSET } as any],
      'USD',
    );

    expect(Math.round(result.summary.safeToSpend)).toBe(40);
  });
});
