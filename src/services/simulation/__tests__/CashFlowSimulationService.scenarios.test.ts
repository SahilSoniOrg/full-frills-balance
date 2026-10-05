import { AppConfig } from '@/src/constants/app-config';
import Transaction from '@/src/data/models/Transaction';
import Budget from '@/src/data/models/Budget';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import {
  AccountSubtype,
  AccountType,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/enums';
import { AccountId, BudgetId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import dayjs from 'dayjs';
import Account from '@/src/data/models/Account';
import { FlowCategory, FlowSource } from '../types';
import {
  accountLedgerMetricsQueries,
  accountQueryRepository,
  atSimulationDay,
  budgetRepository,
  buildUsdWalletFixture,
  cashFlowSimulationService,
  convertAmount,
  installCashFlowSimulationTestHooks,
  makeAsset,
  makeCreditCard,
  makeExpense,
  makeLoan,
  resolveSpotExchangeRate,
  simulateCashFlow,
  transactionQueryRepository,
  transactionRawMetricsQueries,
} from './cashFlowSimulationTestHarness';

describe('CashFlowSimulationService scenario coverage', () => {
  const { cash, savings, groceries, dining, cc, loan } = buildUsdWalletFixture();
  const simulate = (overrides?: Record<string, unknown>) => simulateCashFlow(overrides ?? {});

  installCashFlowSimulationTestHooks();

  beforeEach(() => {
    (cc.metadataRecords.fetch as jest.Mock).mockResolvedValue([
      { statementDay: 1, dueDay: 15, payFromAccountId: 'cash' },
    ]);
    (loan.metadataRecords.fetch as jest.Mock).mockResolvedValue([
      { emiDay: 20, payFromAccountId: 'cash', emiAmount: 350 },
    ]);
  });

  it('keeps safe-to-spend flat when there are multiple liquid accounts and no future flows', async () => {
    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 1000],
        ['savings' as AccountId, 2500],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      allAccounts: [cash, savings],
    });

    expect(result.simulationResult.summary.safeToSpend).toBe(3500);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(3500);
    expect(result.simulationResult.projections[0].globalBalance).toBe(3500);

    expect(result.accountSummaries!.map(summary => summary.accountId).sort()).toEqual([
      'cash',
      'savings',
    ]);
  });

  it('applies fixed planned outflows and reports shortfall when cash goes negative', async () => {
    const result = await simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 100]]),
      plannedPayments: [
        {
          id: 'pp-rent' as PlannedPaymentId,
          name: 'Rent',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'landlord' as AccountId,
          amount: 300,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
    });

    expect(result.simulationResult.summary.safeToSpend).toBe(0);
    expect(result.simulationResult.summary.shortfall).toBe(500);
    expect(result.simulationResult.summary.trajectoryMinBalance).toBe(-500);
    expect(result.simulationResult.projections.find(p => p.dayOffset === 34)?.globalBalance).toBe(
      -500,
    );
  });

  it('applies income, planned spending, and budget burn together without raising safe-to-spend above starting cash', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-groceries', accountId: groceries.id, account: groceries },
    ]);

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 500]]),
      plannedPayments: [
        {
          id: 'pp-salary' as PlannedPaymentId,
          name: 'Salary',
          fromAccountId: 'employer' as AccountId,
          toAccountId: 'cash' as AccountId,
          amount: 1500,
          nextOccurrence: dayjs('2026-04-03T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'pp-groceries' as PlannedPaymentId,
          name: 'Grocery pickup',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-groceries' as AccountId,
          amount: 120,
          nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-groceries' as BudgetId,
          name: 'Groceries Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, groceries],
    });

    expect(result.simulationResult.summary.firstMajorInflowDay).toBe(2);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(488, 0);
    expect(result.simulationResult.summary.shortfall).toBe(0);
    expect(result.allFlows!.some(flow => flow.amount === 120)).toBe(true);
  });

  it('resolves planned spending against the matching budget category by taking the larger daily amount', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining' as PlannedPaymentId,
          name: 'Dinner reservation',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 80,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-dining',
          name: 'Dining Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, dining],
    });

    const planned = result.allFlows!.find(flow => flow.origin === FlowSource.PLANNED_PAYMENT);
    expect(planned?.amount).toBe(80);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(407.33, 1);
    const budgetFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.BUDGET);
    expect(budgetFlows.length).toBeGreaterThan(0);
  });

  it('splits budget burn across multiple asset accounts while preserving global safe-to-spend', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-shared', accountId: groceries.id, account: groceries },
    ]);

    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 400],
        ['savings' as AccountId, 600],
      ]),
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      budgets: [
        {
          id: 'b-shared' as BudgetId,
          name: 'Shared Grocery Budget',
          amount: 300,
          assetAccountIds: 'cash,savings',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, savings, groceries],
    });

    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(409.68, 0);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'cash')?.usageDetails!
        .totalOutflow,
    ).toBeCloseTo(295.16, 0);
    expect(
      result.accountSummaries!.find(summary => summary.accountId === 'savings')?.usageDetails!
        .totalOutflow,
    ).toBeCloseTo(295.16, 0);
  });

  it('keeps internal liquid transfers net-zero globally while changing account-level balances', async () => {
    const result = await simulate({
      startingBalances: new Map<AccountId, number>([
        ['cash' as AccountId, 1000],
        ['savings' as AccountId, 0],
      ]),
      plannedPayments: [
        {
          id: 'pp-sweep' as PlannedPaymentId,
          name: 'Savings sweep',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'savings' as AccountId,
          amount: 250,
          nextOccurrence: dayjs('2026-04-06T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
      allAccounts: [cash, savings],
    });

    const lastProjection =
      result.simulationResult.projections[result.simulationResult.projections.length - 1];
    expect(result.simulationResult.summary.safeToSpend).toBe(1000);
    expect(lastProjection.accountBalances!.get('cash')).toBe(500);
    expect(lastProjection.accountBalances!.get('savings')).toBe(500);
  });

  it('applies explicit liability overpayments in full and does not generate an additional bill for the covered statement', async () => {
    (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 400]]),
    );

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-cc-overpay' as PlannedPaymentId,
          name: 'Aggressive card payment',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'cc' as AccountId,
          amount: 1000,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      liabilityAccountBalances: [{ account: cc, balance: 400 }],
      allAccounts: [cash, cc],
    });

    expect(result.simulationResult.summary.safeToSpend).toBe(0);
    expect(result.simulationResult.summary.shortfall).toBe(1000);
    expect(result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY)).toHaveLength(0);
    expect(
      result.simulationResult.projections[
        result.simulationResult.projections.length - 1
      ].accountBalances!.get('cash'),
    ).toBe(-1000);
  });

  it('uses settled credit-card payments to reduce only the remaining statement obligation', async () => {
    (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 500]]),
    );
    (accountLedgerMetricsQueries.getPeriodMetrics as jest.Mock).mockResolvedValue({
      totalDecrease: 200,
      totalIncrease: 0,
    });

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      liabilityAccountBalances: [{ account: cc, balance: 800 }],
      allAccounts: [cash, cc],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
    expect(liabilityFlows).toHaveLength(2);
    expect(liabilityFlows[0].amount).toBe(300);
    expect(result.simulationResult.summary.safeToSpend).toBe(200);
  });

  it('models non-credit-card liabilities as a due-date cash obligation', async () => {
    (loan.metadataRecords.fetch as jest.Mock).mockResolvedValue([
      { emiDay: 20, payFromAccountId: 'cash', emiAmount: 350 },
    ]);
    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      liabilityAccountBalances: [{ account: loan, balance: 350 }],
      allAccounts: [cash, loan],
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    expect(liabilityFlows[0].amount).toBe(350);
    expect(liabilityFlows[0].dayOffset).toBe(19);
    expect(result.simulationResult.summary.safeToSpend).toBe(650);
  });

  it('deduplicates a planned payment template when a generated journal exists on the same date', async () => {
    const occurrence = dayjs('2026-04-05T12:00:00Z').valueOf();

    (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([
      { journalId: 'j-rent', accountId: 'cash', transactionType: 'CREDIT', amount: 700 },
      { journalId: 'j-rent', accountId: 'exp-rent', transactionType: 'DEBIT', amount: 700 },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-rent' as PlannedPaymentId,
          name: 'Rent template',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-rent' as AccountId,
          amount: 700,
          nextOccurrence: occurrence,
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      plannedJournals: [
        {
          id: 'j-rent',
          description: 'Rent generated journal',
          journalDate: occurrence,
          plannedPaymentId: 'pp-rent',
        } as any,
      ],
      allAccounts: [
        cash,
        { id: 'exp-rent' as AccountId, name: 'Rent', accountType: AccountType.EXPENSE } as Account,
      ],
    });

    const plannedFlows = result.allFlows!.filter(
      flow =>
        flow.origin === FlowSource.PLANNED_PAYMENT ||
        flow.origin === FlowSource.PLANNED_JOURNAL ||
        flow.resolution === 'MERGED',
    );

    expect(plannedFlows).toHaveLength(2);
    expect(plannedFlows[0].referenceId).toBe('j-rent');
    expect(result.simulationResult.summary.safeToSpend).toBe(0);
  });

  it('reconciles a planned spend against every category covered by a multi-category budget', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-food-shared', accountId: groceries.id, account: groceries },
      { budgetId: 'b-food-shared', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining-shared' as PlannedPaymentId,
          name: 'Shared dining spend',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 80,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-food-shared' as BudgetId,
          name: 'Food Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, groceries, dining],
    });

    const planned = result.allFlows!.find(flow => flow.origin === FlowSource.PLANNED_PAYMENT);
    expect(planned?.amount).toBe(80);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(407.33, 1);
  });

  it('reconciles multiple planned spends in different covered categories against a single budget', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-food', accountId: groceries.id, account: groceries },
      { budgetId: 'b-food', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining' as PlannedPaymentId,
          name: 'Dining spend',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 50,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'pp-groceries' as PlannedPaymentId,
          name: 'Groceries spend',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-groceries' as AccountId,
          amount: 60,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-food' as BudgetId,
          name: 'Food Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, groceries, dining],
    });

    const plannedFlows = result.allFlows!.filter(
      flow => flow.origin === FlowSource.PLANNED_PAYMENT,
    );
    expect(plannedFlows).toHaveLength(4);
    expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(406.33, 1);
  });

  it('handles cross-currency reconciliation with proper normalization', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining', accountId: dining.id, account: dining },
    ]);
    (convertAmount as jest.Mock).mockImplementation(
      async ({ amount, fromCurrency, toCurrency }: any) => {
        if (fromCurrency === toCurrency) return { ok: true, amount };
        if (fromCurrency === 'EUR') return { ok: true, amount: amount * 1.1 };
        return { ok: true, amount };
      },
    );
    (resolveSpotExchangeRate as jest.Mock).mockResolvedValue({ ok: true, rate: 1.1 });

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining-eur' as PlannedPaymentId,
          name: 'European Dinner',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 20, // 20 EUR -> 22 USD
          currencyCode: 'EUR',
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
        },
      ],
      budgets: [
        {
          id: 'b-dining',
          name: 'Dining Budget',
          amount: 300, // 10 USD/day
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, dining],
    });

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);

    // Resolved should be 22 USD (max of 10 USD limit vs 22 USD actual)
    expect(resolved?.amount).toBe(22);
  });

  it('supports nested category reconciliation through ancestral budget scopes', async () => {
    const food = { id: 'exp-food', name: 'Food', accountType: AccountType.EXPENSE } as any;
    const snacks = {
      id: 'exp-snacks',
      name: 'Snacks',
      accountType: AccountType.EXPENSE,
      parentAccountId: 'exp-food',
    } as any;

    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-food-parent', accountId: food.id, account: food },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-snacks' as PlannedPaymentId,
          name: 'Snack run',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-snacks' as AccountId,
          amount: 50,
          nextOccurrence: dayjs('2026-04-08T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-food-parent' as BudgetId,
          name: 'Food Parent Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, food, snacks],
    });

    const resolved = result.allFlows!.find(flow => flow.resolvedFrom !== undefined);

    expect(resolved?.amount).toBe(50);
  });

  it('generates no flows for overspent budgets in current month but preserves future months', async () => {
    // Set time to late in the month so next month is within the 30-day window
    jest.setSystemTime(new Date('2026-04-25T00:00:00Z'));
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-overspent', accountId: groceries.id, account: groceries },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      budgets: [
        {
          id: 'b-overspent' as BudgetId,
          name: 'Overspent Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: -50 }],
      allAccounts: [cash, groceries],
    });

    const budgetFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.BUDGET);

    // On April 25, daysLeftInMonth is 6 (25, 26, 27, 28, 29, 30).
    // So currentMonthDailyRate (0) applies for dayOffset 0..5.
    // Next month flows start at dayOffset 6.
    expect(budgetFlows.every(f => f.dayOffset >= 6)).toBe(true);
    expect(budgetFlows.length).toBeGreaterThan(0);
  });

  it('resolves cleanly when planned spend is exactly equal to budget burn', async () => {
    (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
      { budgetId: 'b-dining-exact', accountId: dining.id, account: dining },
    ]);

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-dining-exact' as PlannedPaymentId,
          name: 'Exact Dinner',
          fromAccountId: 'cash' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 10, // Matches 300/30
          nextOccurrence: dayjs('2026-04-01T12:00:00Z').valueOf(),
          intervalType: 'DAILY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      budgets: [
        {
          id: 'b-dining-exact' as BudgetId,
          name: 'Exact Dining Budget',
          amount: 300,
          assetAccountIds: 'cash',
          currencyCode: 'USD',
        },
      ],
      usages: [{ remaining: 300 }],
      allAccounts: [cash, dining],
    });

    const budgetFlow = result.allFlows!.find(flow => flow.origin === FlowSource.BUDGET);

    // effectiveRemaining = 300 - (30*10) = 0. No budget flows emitted.
    expect(budgetFlow).toBeUndefined();
    expect(result.simulationResult.summary.safeToSpend).toBe(400);
  });

  it('rolls future credit-card planned spending into a future liability obligation', async () => {
    // CC: Statement 1st, Due 15th.
    // Today is April 1st.
    // April 1st spending -> May 1st Statement -> May 15th Due.

    (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 0]]),
    );

    const result = await simulate({
      startingBalances: new Map([['cash' as AccountId, 1000]]),
      plannedPayments: [
        {
          id: 'pp-cc-spending' as PlannedPaymentId,
          name: 'Credit card spending',
          fromAccountId: 'cc' as AccountId,
          toAccountId: 'exp-dining' as AccountId,
          amount: 200,
          nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
      ],
      liabilityAccountBalances: [{ account: cc, balance: 0 }],
      allAccounts: [cash, cc, dining],
      simulationDays: 60, // simulationDays must be large enough to catch the May 15th bill (44 days out)
    });

    const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

    // We expect an obligation on May 15th (dayOffset approx 44) for $200
    const mayBill = liabilityFlows.find(f => f.dayOffset > 40);

    expect(mayBill).toMatchObject({
      amount: 200,
      accountId: 'cash',
    });

    // Safe to spend should consider this future obligation
    // 1000 - 200 = 800
    expect(result.simulationResult.summary.safeToSpend).toBe(800);
  });

  describe('core service behaviors', () => {
    const liquidAccountId = 'cash-1' as AccountId;
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

    it('runs a basic simulation with starting balance and no flows', async () => {
      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map<AccountId, number>([[liquidAccountId, 1000]]),
        plannedPayments: [],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

      expect(result.simulationResult.summary.safeToSpend).toBe(1000);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1000);
      expect(result.simulationResult.projections[0].globalBalance).toBe(1000);
    });

    it('reports liability balances in the result currency', async () => {
      const liabilityAccount = {
        id: 'liability-eur' as AccountId,
        name: 'EUR Card',
        accountType: AccountType.LIABILITY,
        accountSubtype: AccountSubtype.CREDIT_CARD,
        currencyCode: 'EUR',
        metadataRecords: { fetch: jest.fn().mockResolvedValue([]) },
      } as any;

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map<AccountId, number>([[liquidAccountId, 1000]]),
        plannedPayments: [],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [{ account: liabilityAccount, balance: 100 }],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount, liabilityAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 30,
      });

      expect(result.report.liabilities.total).toBe(200);
    });

    it('handles simple OUTFLOW correctly', async () => {
      const plannedPayment = {
        id: 'pp-1' as PlannedPaymentId,
        name: 'Rent',
        fromAccountId: liquidAccountId,
        toAccountId: 'landlord' as AccountId,
        amount: 400,
        nextOccurrence: dayjs('2026-04-05T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      } as any;

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map<AccountId, number>([[liquidAccountId, 1000]]),
        plannedPayments: [plannedPayment],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

      // Initial 1000.
      // Occurrence 1: Day 5 (offset 4) - 400 = 600
      // Occurrence 2: Day 35 (offset 34) - 400 = 200 (since 60-day window)
      expect(result.simulationResult.summary.safeToSpend).toBe(200);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBe(200);
    });

    it('handles TRANSFER between liquid accounts correctly (net zero)', async () => {
      const otherAccountId = 'bank-2' as AccountId;
      const otherAccount = {
        id: otherAccountId,
        name: 'Bank 2',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
      } as any;

      const plannedTransfer = {
        id: 'pp-trans' as PlannedPaymentId,
        name: 'Internal Transfer',
        fromAccountId: liquidAccountId,
        toAccountId: otherAccountId,
        amount: 500,
        nextOccurrence: dayjs('2026-04-10T12:00:00Z').valueOf(),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      } as any;

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map<AccountId, number>([
          [liquidAccountId, 1000],
          [otherAccountId, 0],
        ]),
        plannedPayments: [plannedTransfer],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId, otherAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount, otherAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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
        id: 'b-1' as BudgetId,
        name: 'Eating Out',
        amount: 300,
        assetAccountIds: liquidAccountId,
      } as any;
      const usage = {
        remaining: 300,
      } as any;
      const expenseAccount = {
        id: 'exp-eating' as AccountId,
        accountType: AccountType.EXPENSE,
      } as any;
      const budgetId = budget.id;
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId, accountId: expenseAccount.id, account: expenseAccount },
      ]);

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [budget],
        usages: [usage],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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
      const findByJournalsMock = transactionQueryRepository.findByJournals as jest.MockedFunction<
        typeof transactionQueryRepository.findByJournals
      >;
      findByJournalsMock.mockResolvedValueOnce([journalTx]);

      const plannedJournal = {
        id: 'pj-eur',
        description: 'Euro payment',
        journalDate: dayjs('2026-04-03T12:00:00Z').valueOf(),
      } as any;

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [],
        plannedJournals: [plannedJournal],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount, expenseAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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

      (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
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
      transactionRawMetricsQueries.getLatestBalancesRaw = jest
        .fn()
        .mockResolvedValue(new Map([[ccId, 500]]));

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [plannedPayment],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [{ account: ccAccount, balance: 500 }],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount, ccAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 2000]]),
        plannedPayments: [plannedPayment],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [budget],
        usages: [usage],
        allAccounts: [liquidAccount, expenseAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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
      expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(20, 0);
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

      (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
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
      transactionRawMetricsQueries.getLatestBalancesRaw = jest
        .fn()
        .mockResolvedValue(new Map([[ccId, 500]]));
      accountLedgerMetricsQueries.getPeriodMetrics = jest
        .fn()
        .mockResolvedValue({ totalDecrease: 0, totalIncrease: 0 });

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [plannedInflow],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [{ account: ccAccount, balance: 500 }],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount, ccAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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

      (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
        { accountId: ccId, statementDay: 1, dueDay: 15 },
      ]);

      // Mock repository:
      // 1. Statement Balance = 500
      // 2. Already settled since statement date = 200
      transactionRawMetricsQueries.getLatestBalancesRaw = jest
        .fn()
        .mockResolvedValue(new Map([[ccId, 500]]));
      accountLedgerMetricsQueries.getPeriodMetrics = jest
        .fn()
        .mockResolvedValue({ totalDecrease: 200, totalIncrease: 0 });

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [{ account: ccAccount, balance: 800 }],
        // Current balance 800
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount, ccAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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
      transactionQueryRepository.findByJournals = jest
        .fn()
        .mockResolvedValue(journalTxs.map(tx => ({ ...tx, journalId: journal.id })));

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 5000]]),
        plannedPayments: [plannedPayment],
        plannedJournals: [journal],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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

    it('does not project a planned journal whose planned payment was deleted', async () => {
      const orphanJournal = {
        id: 'j-orphan-rent',
        description: 'Ghost rent',
        journalDate: dayjs('2026-04-05T12:00:00Z').valueOf(),
        plannedPaymentId: 'pp-deleted',
        status: 'PLANNED',
      } as any;

      transactionQueryRepository.findByJournals = jest.fn().mockResolvedValue([
        {
          journalId: orphanJournal.id,
          accountId: liquidAccountId,
          transactionType: 'CREDIT',
          amount: 1000,
          currencyCode: 'USD',
        },
        {
          journalId: orphanJournal.id,
          accountId: 'landlord',
          transactionType: 'DEBIT',
          amount: 1000,
          currencyCode: 'USD',
        },
      ]);

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 5000]]),
        plannedPayments: [],
        plannedJournals: [orphanJournal],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

      expect(result.simulationResult.summary.safeToSpend).toBe(5000);
      expect(
        result.allFlows!.filter(
          (flow: { origin: FlowSource }) => flow.origin === FlowSource.PLANNED_JOURNAL,
        ),
      ).toHaveLength(0);
    });

    it('still projects a planned journal that is not linked to a planned payment', async () => {
      const manualJournal = {
        id: 'j-manual-planned',
        description: 'Manual planned bill',
        journalDate: dayjs('2026-04-05T12:00:00Z').valueOf(),
        status: 'PLANNED',
      } as any;

      transactionQueryRepository.findByJournals = jest.fn().mockResolvedValue([
        {
          journalId: manualJournal.id,
          accountId: liquidAccountId,
          transactionType: 'CREDIT',
          amount: 250,
          currencyCode: 'USD',
        },
      ]);

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [],
        plannedJournals: [manualJournal],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

      expect(result.simulationResult.summary.safeToSpend).toBe(750);
      expect(
        result.allFlows!.filter(
          (flow: { origin: FlowSource }) => flow.origin === FlowSource.PLANNED_JOURNAL,
        ),
      ).toHaveLength(1);
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

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [plannedPayment],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 1000]]),
        plannedPayments: [plannedPayment],
        plannedJournals: [],
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [liquidAccount],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

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

  describe('heavy scenario coverage', () => {
    const atDay = atSimulationDay;

    it('handles a dense mixed portfolio and preserves simulation invariants', async () => {
      const liquidAccounts = [
        makeAsset('cash', 'Checking'),
        makeAsset('savings', 'Savings'),
        makeAsset('wallet', 'Wallet'),
      ];
      const expenseAccounts = Array.from({ length: 8 }, (_, index) =>
        makeExpense(`exp-${index}`, `Expense ${index}`),
      );
      const creditCards = [
        makeCreditCard('cc-1', { name: 'Travel Card', dueDay: 15 }),
        makeCreditCard('cc-2', { name: 'Backup Card', dueDay: 25 }),
      ];
      const loan = makeLoan('loan-1', { name: 'Personal Loan', emiDay: 20 });
      const allAccounts = [...liquidAccounts, ...expenseAccounts, ...creditCards, loan];

      const budgets = expenseAccounts.map(
        (_, index) =>
          ({
            id: `budget-${index}` as BudgetId,
            name: `Budget ${index}`,
            amount: 150 + index * 25,
            assetAccountIds: index % 2 === 0 ? 'cash,savings' : 'cash',
            currencyCode: 'USD',
          }) as any,
      );
      const usages = budgets.map(budget => ({ remaining: budget.amount }) as any);
      const allScopes = budgets.flatMap((budget, index) => [
        {
          budgetId: budget.id,
          accountId: expenseAccounts[index].id,
          account: expenseAccounts[index],
        },
      ]);
      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue(allScopes);

      const plannedPayments = [
        {
          id: 'salary' as PlannedPaymentId,
          name: 'Salary',
          fromAccountId: 'external-income' as AccountId,
          toAccountId: 'cash' as AccountId,
          amount: 4000,
          nextOccurrence: atDay(9),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'transfer-savings',
          name: 'Savings transfer',
          fromAccountId: 'cash',
          toAccountId: 'savings',
          amount: 700,
          nextOccurrence: atDay(4),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'transfer-wallet',
          name: 'Wallet top-up',
          fromAccountId: 'cash',
          toAccountId: 'wallet',
          amount: 120,
          nextOccurrence: atDay(6),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'cc-payment-1',
          name: 'Travel Card Payment',
          fromAccountId: 'cash',
          toAccountId: 'cc-1',
          amount: 250,
          nextOccurrence: atDay(5),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        {
          id: 'cc-payment-2',
          name: 'Backup Card Payment',
          fromAccountId: 'savings',
          toAccountId: 'cc-2',
          amount: 100,
          nextOccurrence: atDay(15),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        },
        ...expenseAccounts.map((expense, index) => ({
          id: `planned-expense-${index}`,
          name: `Planned Expense ${index}`,
          fromAccountId: index % 3 === 0 ? 'savings' : 'cash',
          toAccountId: expense.id,
          amount: 40 + index * 10,
          nextOccurrence: atDay(2 + index * 3),
          intervalType: 'MONTHLY',
          intervalN: 1,
          currencyCode: 'USD',
        })),
      ] as any[];

      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
        new Map([
          ['cc-1', 600],
          ['cc-2', 300],
        ]),
      );
      (accountLedgerMetricsQueries.getPeriodMetrics as jest.Mock).mockImplementation(
        (_wp: WorkplaceId, accountId: string) =>
          Promise.resolve({
            totalDecrease: accountId === 'cc-1' ? 100 : 0,
            totalIncrease: 0,
          }),
      );

      // Mock metadata for batch fetch
      const liabilityAccountBalances = [
        { account: creditCards[0], balance: 900 },
        { account: creditCards[1], balance: 300 },
        { account: loan, balance: 500 },
      ];
      const metadataList = await Promise.all(
        liabilityAccountBalances.map(async lb => ({
          ...(await (lb.account.metadataRecords.fetch as jest.Mock)())[0],
          accountId: lb.account.id,
        })),
      );
      (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue(
        metadataList,
      );

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map<AccountId, number>([
          ['cash' as AccountId, 2500],
          ['savings' as AccountId, 1200],
          ['wallet' as AccountId, 300],
        ]),
        plannedPayments: plannedPayments,
        plannedJournals: [],
        liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId, 'wallet' as AccountId],
        liabilityAccountBalances: liabilityAccountBalances,
        budgets: budgets,
        usages: usages,
        allAccounts: allAccounts,
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: AppConfig.defaults.safeToSpendDays,
      });

      expect(result.simulationResult.projections).toHaveLength(AppConfig.defaults.safeToSpendDays);
      expect(result.allFlows!.length).toBeGreaterThan(250);
      expect(result.accountSummaries!.length).toBe(3);
      expect(result.simulationResult.summary.firstMajorInflowDay).toBe(9);
      expect(result.simulationResult.summary.shortfall).toBe(0);
      expect(result.simulationResult.summary.safeToSpend).toBeGreaterThan(0);
      expect(result.simulationResult.summary.safeToSpend).toBeLessThanOrEqual(4000);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBeGreaterThanOrEqual(
        result.simulationResult.summary.safeToSpend,
      );

      const bySource = result.allFlows!.reduce((map, flow) => {
        const source = flow.origin ?? 'UNKNOWN';
        map.set(source, (map.get(source) ?? 0) + 1);
        return map;
      }, new Map<string, number>());

      expect(bySource.get(FlowSource.BUDGET)).toBeGreaterThan(200);
      expect(bySource.get(FlowSource.PLANNED_PAYMENT)).toBeGreaterThanOrEqual(4);
      const resolvedCount = result.allFlows!.filter(f => f.resolution === 'MERGED').length;
      expect(resolvedCount).toBeGreaterThanOrEqual(1);
      expect(result.allFlows!.some(flow => flow.kind === 'TRANSFER')).toBe(true);

      for (const flow of result.allFlows!) {
        expect(Number.isFinite(flow.amount)).toBe(true);
        expect(flow.amount).toBeGreaterThan(0);
        expect(flow.dayOffset).toBeGreaterThanOrEqual(0);
        expect(flow.dayOffset).toBeLessThan(AppConfig.defaults.safeToSpendDays);
      }

      for (const projection of result.simulationResult.projections) {
        expect(Number.isFinite(projection.globalBalance)).toBe(true);
        expect(projection.timestamp).toBeGreaterThan(0);
      }
    });

    it('handles many generated journals without double-counting covered planned payment templates', async () => {
      const cash = makeAsset('cash', 'Checking');
      const expenseAccounts = Array.from({ length: 12 }, (_, index) =>
        makeExpense(`journal-exp-${index}`, `Journal Expense ${index}`),
      );

      const plannedPayments = expenseAccounts.map((expense, index) => ({
        id: `pp-journal-${index}`,
        name: `Template ${index}`,
        fromAccountId: 'cash',
        toAccountId: expense.id,
        amount: 50 + index,
        nextOccurrence: atDay(index + 1),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      })) as any[];

      const plannedJournals = plannedPayments.map(
        (payment, index) =>
          ({
            id: `journal-${index}`,
            description: `Generated Journal ${index}`,
            journalDate: payment.nextOccurrence,
            plannedPaymentId: payment.id,
          }) as any,
      );

      (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue(
        plannedJournals.flatMap((journal, index) => [
          {
            journalId: journal.id,
            accountId: 'cash',
            transactionType: 'CREDIT',
            amount: 50 + index,
          },
          {
            journalId: journal.id,
            accountId: expenseAccounts[index].id,
            transactionType: 'DEBIT',
            amount: 50 + index,
          },
        ]),
      );

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map<AccountId, number>([['cash' as AccountId, 2000]]),
        plannedPayments: plannedPayments,
        plannedJournals: plannedJournals,
        liquidAssetIds: ['cash' as AccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [cash, ...expenseAccounts],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

      const plannedFlows = result.allFlows!.filter(
        flow =>
          flow.origin === FlowSource.PLANNED_PAYMENT || flow.origin === FlowSource.PLANNED_JOURNAL,
      );
      const generatedJournalIds = new Set(plannedJournals.map(journal => journal.id));
      const journalFlows = plannedFlows.filter(flow => flow.origin === FlowSource.PLANNED_JOURNAL);
      const templateFlows = plannedFlows.filter(flow => flow.origin === FlowSource.PLANNED_PAYMENT);

      // Each generated journal contributes exactly one flow.
      expect(journalFlows).toHaveLength(plannedJournals.length);
      expect(journalFlows.every(flow => generatedJournalIds.has(flow.referenceId ?? ''))).toBe(
        true,
      );

      // A template must never emit a flow on a day its own generated journal already
      // covers. Later uncovered occurrences (these are MONTHLY templates, so they
      // recur again inside a 60-day horizon) are expected and must still be counted.
      const plannedPaymentIdByJournalId = new Map(
        plannedJournals.map(journal => [journal.id, journal.plannedPaymentId]),
      );
      const coveredKeys = new Set(
        journalFlows.map(
          flow => `${plannedPaymentIdByJournalId.get(flow.referenceId ?? '')}:${flow.dayOffset}`,
        ),
      );
      expect(
        templateFlows.some(flow => coveredKeys.has(`${flow.referenceId}:${flow.dayOffset}`)),
      ).toBe(false);

      // With no inflows, the minimum balance is the starting balance less every outflow.
      const totalOutflow = plannedFlows.reduce((sum, flow) => sum + flow.amount, 0);
      expect(result.simulationResult.summary.safeToSpend).toBe(2000 - totalOutflow);
      expect(result.simulationResult.summary.shortfall).toBe(0);
    });

    it('handles a large negative-cash scenario and reports coherent shortfall', async () => {
      const cash = makeAsset('cash', 'Checking');
      const plannedPayments = Array.from({ length: 20 }, (_, index) => ({
        id: `large-outflow-${index}`,
        name: `Large Outflow ${index}`,
        fromAccountId: 'cash',
        toAccountId: `external-${index}`,
        amount: 75,
        nextOccurrence: atDay(index % 10),
        intervalType: 'MONTHLY',
        intervalN: 1,
        currencyCode: 'USD',
      })) as any[];

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map<AccountId, number>([['cash' as AccountId, 500]]),
        plannedPayments: plannedPayments,
        plannedJournals: [],
        liquidAssetIds: ['cash' as AccountId],
        liabilityAccountBalances: [],
        budgets: [],
        usages: [],
        allAccounts: [cash],
        resultCurrency: 'USD',
        workplaceId: 'test-wp' as WorkplaceId,
        simulationDays: 60,
      });

      expect(result.simulationResult.summary.safeToSpend).toBe(0);
      expect(result.simulationResult.summary.shortfall).toBe(2500);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBe(-2500);
      expect(
        result.simulationResult.projections[result.simulationResult.projections.length - 1]
          .globalBalance,
      ).toBe(-2500);
      expect(result.allFlows).toHaveLength(40);
      expect(result.allFlows!.every(flow => flow.origin === FlowSource.PLANNED_PAYMENT)).toBe(true);
    });
  });

  describe('liability-heavy coverage', () => {
    const simulateLiabilities = (overrides?: Record<string, unknown>) =>
      simulateCashFlow({
        startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1000]]),
        liquidAssetIds: ['cash' as AccountId],
        allAccounts: [makeAsset('cash', 'Checking')],
        ...overrides,
      });

    it('routes multiple liability obligations to the configured liquid accounts with exact remaining-statement math', async () => {
      const cash = makeAsset('cash', 'Checking');
      const savings = makeAsset('savings', 'Savings');
      const ccPrimary = makeCreditCard('cc-primary', {
        name: 'Primary Card',
        dueDay: 15,
        payFromAccountId: 'cash',
      });
      const ccBackup = makeCreditCard('cc-backup', {
        name: 'Backup Card',
        dueDay: 10,
        payFromAccountId: 'savings',
      });
      const loan = makeLoan('loan-car', {
        name: 'Car Loan',
        emiDay: 20,
        payFromAccountId: 'cash',
        emiAmount: 600,
      });

      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockImplementation(
        (_wp: WorkplaceId, ids: string[]) => {
          const id = ids[0];
          return Promise.resolve(new Map([[id, id === 'cc-primary' ? 500 : 300]]));
        },
      );
      (accountLedgerMetricsQueries.getPeriodMetrics as jest.Mock).mockImplementation(
        (_wp: WorkplaceId, accountId: string) =>
          Promise.resolve({
            totalDecrease: accountId === 'cc-primary' ? 100 : accountId === 'cc-backup' ? 50 : 0,
            totalIncrease: 0,
          }),
      );

      const result = await simulateLiabilities({
        startingBalances: new Map<AccountId, number>([
          ['cash' as AccountId, 1500],
          ['savings' as AccountId, 800],
        ]),
        liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
        liabilityAccountBalances: [
          { account: ccPrimary, balance: 800 },
          { account: ccBackup, balance: 300 },
          { account: loan, balance: 600 },
        ],
        allAccounts: [cash, savings, ccPrimary, ccBackup, loan],
      });

      const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
      expect(liabilityFlows).toHaveLength(5);
      expect(liabilityFlows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: 'savings', amount: 250, dayOffset: 9 }),
          expect.objectContaining({ accountId: 'cash', amount: 400, dayOffset: 14 }),
          expect.objectContaining({ accountId: 'cash', amount: 600, dayOffset: 19 }),
        ]),
      );
      expect(result.simulationResult.summary.safeToSpend).toBe(600);
      expect(result.simulationResult.summary.shortfall).toBe(0);
      expect(
        result.accountSummaries!.find(summary => summary.accountId === 'cash')?.usageDetails!
          .totalOutflow,
      ).toBe(1400);
      expect(
        result.accountSummaries!.find(summary => summary.accountId === 'savings')?.usageDetails!
          .totalOutflow,
      ).toBe(300);
    });

    it('reports a coherent shortfall when stacked liabilities exceed liquid balances', async () => {
      const cash = makeAsset('cash', 'Checking');
      const savings = makeAsset('savings', 'Savings');
      const cc = makeCreditCard('cc', { name: 'Card', dueDay: 15, payFromAccountId: 'cash' });
      const loan = makeLoan('loan-a', {
        name: 'Loan A',
        emiDay: 10,
        payFromAccountId: 'cash',
        emiAmount: 400,
      });

      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
        new Map([['cc', 250]]),
      );

      const result = await simulateLiabilities({
        startingBalances: new Map<AccountId, number>([
          ['cash' as AccountId, 300],
          ['savings' as AccountId, 100],
        ]),
        liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId],
        liabilityAccountBalances: [
          { account: cc, balance: 250 },
          { account: loan, balance: 400 },
        ],
        allAccounts: [cash, savings, cc, loan],
      });

      expect(result.simulationResult.summary.safeToSpend).toBe(0);
      expect(result.simulationResult.summary.shortfall).toBe(250);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBe(-250);
      expect(
        result.simulationResult.projections[
          result.simulationResult.projections.length - 1
        ].accountBalances!.get('cash'),
      ).toBe(-350);
    });

    it('skips liabilities whose configured pay-from account is outside the tracked liquid set', async () => {
      const cash = makeAsset('cash', 'Checking');
      const externalCard = makeCreditCard('cc-external', {
        name: 'External Card',
        dueDay: 12,
        payFromAccountId: 'brokerage',
      });
      const trackedLoan = makeLoan('loan-tracked', {
        name: 'Tracked Loan',
        emiDay: 20,
        payFromAccountId: 'cash',
        emiAmount: 200,
      });

      const result = await simulateLiabilities({
        startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1000]]),
        liabilityAccountBalances: [
          { account: externalCard, balance: 500 },
          { account: trackedLoan, balance: 200 },
        ],
        allAccounts: [cash, externalCard, trackedLoan],
      });

      const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

      expect(liabilityFlows).toHaveLength(1);
      expect(liabilityFlows[0]).toEqual(
        expect.objectContaining({
          accountId: 'cash',
          amount: 200,
          dayOffset: 19,
        }),
      );
      expect(result.simulationResult.summary.safeToSpend).toBe(800);
    });

    it('normalizes mixed-currency liquid balances and non-credit liabilities into the result currency', async () => {
      const cash = makeAsset('cash', 'Checking', 'USD');
      const euroSavings = makeAsset('eur-savings', 'Euro Savings', 'EUR');
      const euroLoan = makeLoan('eur-loan', {
        name: 'Euro Loan',
        emiDay: 10,
        payFromAccountId: 'cash',
        currencyCode: 'EUR',
        emiAmount: 50,
      });

      (convertAmount as jest.Mock).mockImplementation(
        async ({ amount, fromCurrency, toCurrency }: any) => {
          if (fromCurrency === toCurrency) return { ok: true, amount };
          if (fromCurrency === 'EUR' && toCurrency === 'USD') {
            return { ok: true, amount: amount * 2 };
          }
          return { ok: true, amount };
        },
      );
      (resolveSpotExchangeRate as jest.Mock).mockResolvedValue({ ok: true, rate: 2 });

      const result = await simulateLiabilities({
        startingBalances: new Map<AccountId, number>([
          ['cash' as AccountId, 1000],
          ['eur-savings' as AccountId, 100],
        ]),
        liquidAssetIds: ['cash' as AccountId, 'eur-savings' as AccountId],
        liabilityAccountBalances: [{ account: euroLoan, balance: 50 }],
        allAccounts: [cash, euroSavings, euroLoan],
      });

      const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

      expect(liabilityFlows).toHaveLength(1);
      expect(liabilityFlows[0]).toEqual(
        expect.objectContaining({
          accountId: 'cash',
          amount: 100,
          dayOffset: 9,
        }),
      );
      expect(result.simulationResult.summary.safeToSpend).toBe(1100);
      expect(result.simulationResult.summary.shortfall).toBe(0);
    });

    it('handles a larger liability portfolio while preserving flow and projection invariants', async () => {
      const liquidAccounts = [
        makeAsset('cash', 'Checking'),
        makeAsset('savings', 'Savings'),
        makeAsset('wallet', 'Wallet'),
      ];
      const creditCards = Array.from({ length: 6 }, (_, index) =>
        makeCreditCard(`cc-${index}`, {
          name: `Card ${index}`,
          dueDay: 6 + index * 2,
          payFromAccountId: index % 2 === 0 ? 'cash' : 'savings',
        }),
      );
      const loans = Array.from({ length: 4 }, (_, index) =>
        makeLoan(`loan-${index}`, {
          name: `Loan ${index}`,
          emiDay: 12 + index * 3,
          payFromAccountId: index % 2 === 0 ? 'cash' : 'savings',
          emiAmount: 100,
        }),
      );
      const allAccounts = [...liquidAccounts, ...creditCards, ...loans];

      const statementBalances = new Map<string, number>();
      const settledAmounts = new Map<string, number>();
      creditCards.forEach((card, index) => {
        statementBalances.set(card.id, 300 + index * 40);
        settledAmounts.set(card.id, index * 10);
      });

      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockImplementation(
        (_wp: WorkplaceId, ids: string[]) => {
          const id = ids[0];
          return Promise.resolve(new Map([[id, statementBalances.get(id) || 0]]));
        },
      );
      (accountLedgerMetricsQueries.getPeriodMetrics as jest.Mock).mockImplementation(
        (_wp: WorkplaceId, accountId: string) =>
          Promise.resolve({
            totalDecrease: settledAmounts.get(accountId) || 0,
            totalIncrease: 0,
          }),
      );

      const liabilityBalances = [
        ...creditCards.map((card, index) => ({ account: card, balance: 500 + index * 60 })),
        ...loans.map((loan, index) => ({ account: loan, balance: 250 + index * 80 })),
      ];

      const result = await simulateLiabilities({
        startingBalances: new Map<AccountId, number>([
          ['cash' as AccountId, 5000],
          ['savings' as AccountId, 3200],
          ['wallet' as AccountId, 150],
        ]),
        liquidAssetIds: ['cash' as AccountId, 'savings' as AccountId, 'wallet' as AccountId],
        liabilityAccountBalances: liabilityBalances,
        allAccounts: allAccounts,
      });

      const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);
      expect(liabilityFlows).toHaveLength(20);
      expect(result.simulationResult.projections).toHaveLength(60);
      expect(result.simulationResult.summary.safeToSpend).toBeGreaterThanOrEqual(0);
      expect(result.simulationResult.summary.safeToSpend).toBeLessThanOrEqual(8350);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBeLessThanOrEqual(8350);

      for (const flow of liabilityFlows) {
        expect(flow.amount).toBeGreaterThan(0);
        expect(flow.dayOffset).toBeGreaterThanOrEqual(0);
        expect(flow.dayOffset).toBeLessThan(60);
        expect(['cash', 'savings']).toContain((flow as any).accountId);
      }
    });

    it('applies explicit liability payments only to the liability they target', async () => {
      const cash = makeAsset('cash', 'Checking');
      const cardA = makeCreditCard('cc-a', {
        name: 'Card A',
        statementDay: 1,
        dueDay: 15,
        payFromAccountId: 'cash',
      });
      const cardB = makeCreditCard('cc-b', {
        name: 'Card B',
        statementDay: 1,
        dueDay: 15,
        payFromAccountId: 'cash',
      });

      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockImplementation(
        (_wp: WorkplaceId, ids: string[]) => Promise.resolve(new Map([[ids[0], 400]])),
      );

      const result = await simulateLiabilities({
        startingBalances: new Map<AccountId, number>([['cash' as AccountId, 1000]]),
        plannedPayments: [
          {
            id: 'pp-card-a',
            name: 'Card A payment',
            fromAccountId: 'cash',
            toAccountId: 'cc-a',
            amount: 250,
            nextOccurrence: new Date('2026-04-05T12:00:00Z').valueOf(),
            intervalType: 'MONTHLY',
            intervalN: 1,
            currencyCode: 'USD',
          },
        ],
        liabilityAccountBalances: [
          { account: cardA, balance: 400 },
          { account: cardB, balance: 400 },
        ],
        allAccounts: [cash, cardA, cardB],
      });

      const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

      expect(liabilityFlows).toHaveLength(2);
      expect(liabilityFlows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            referenceId: 'cc-a',
            amount: 150,
          }),
          expect.objectContaining({
            referenceId: 'cc-b',
            amount: 400,
          }),
        ]),
      );
      expect(result.simulationResult.summary.safeToSpend).toBe(0);
    });

    it('normalizes foreign-currency credit-card balances before obligation math', async () => {
      const cash = makeAsset('cash', 'Checking', 'USD');
      const euroCard = makeCreditCard('cc-eur', {
        name: 'Euro Card',
        statementDay: 1,
        dueDay: 15,
        payFromAccountId: 'cash',
        currencyCode: 'EUR',
      });

      (convertAmount as jest.Mock).mockImplementation(
        async ({ amount, fromCurrency, toCurrency }: any) => {
          if (fromCurrency === toCurrency) return { ok: true, amount };
          if (fromCurrency === 'EUR' && toCurrency === 'USD') {
            return { ok: true, amount: amount * 2 };
          }
          return { ok: true, amount };
        },
      );
      (resolveSpotExchangeRate as jest.Mock).mockResolvedValue({ ok: true, rate: 2 });
      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
        new Map([['cc-eur', 400]]),
      );
      (accountLedgerMetricsQueries.getPeriodMetrics as jest.Mock).mockResolvedValue({
        totalDecrease: 100,
        totalIncrease: 0,
      });

      const result = await simulateLiabilities({
        startingBalances: new Map<AccountId, number>([['cash' as AccountId, 2000]]),
        liabilityAccountBalances: [{ account: euroCard, balance: 500 }],
        allAccounts: [cash, euroCard],
      });

      const liabilityFlows = result.allFlows!.filter(flow => flow.origin === FlowSource.LIABILITY);

      expect(liabilityFlows).toHaveLength(2);
      expect(liabilityFlows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            referenceId: 'cc-eur',
            amount: 600,
            dayOffset: 14,
          }),
          expect.objectContaining({
            referenceId: 'cc-eur',
            amount: 400,
            dayOffset: 44,
          }),
        ]),
      );
    });
  });

  describe('forward-finance characterization locks', () => {
    const wallet = buildUsdWalletFixture();
    const {
      liquidAccountId,
      savingsAccount,
      creditCardAccount,
      foodExpenseAccount,
      rentExpenseAccount,
      characterizationAccounts,
      workplaceId,
    } = wallet;
    const foodExpenseAccountId = foodExpenseAccount.id;
    const rentExpenseAccountId = rentExpenseAccount.id;
    const savingsAccountId = savingsAccount.id;
    const creditCardAccountId = creditCardAccount.id;
    const baseAccounts = characterizationAccounts;

    it('LOCK 1: pure budget burn with no planned payments', async () => {
      const budgetId = 'b-food' as BudgetId;
      const foodBudget = {
        id: budgetId,
        name: 'Food & Dining',
        amount: 900,
        currencyCode: 'USD',
        intervalType: 'MONTHLY',
        intervalN: 1,
        recurrenceDay: 1,
        assetAccountIds: liquidAccountId,
        workplaceId,
      } as unknown as Budget;

      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId, accountId: foodExpenseAccountId, workplaceId },
      ]);

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 3000]]),
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        allAccounts: baseAccounts,
        budgets: [foodBudget],
        usages: [{ spent: 0, remaining: 900, budgetAmount: 900, usagePercent: 0 }],
        plannedPayments: [],
        plannedJournals: [],
        resultCurrency: 'USD',
        workplaceId,
        simulationDays: 30,
      });

      // 900 / 30 days = 30 USD daily burn
      const budgetFlows = result.allFlows.filter(f => f.category === FlowCategory.BUDGET);
      expect(budgetFlows.length).toBe(30);
      expect(budgetFlows[0].amount).toBe(30);
      expect(result.simulationResult.summary.safeToSpend).toBe(2100);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBe(2100);
    });

    it('LOCK 2: discrete planned payment (income + expense + internal transfer)', async () => {
      const salary = {
        id: 'pp-salary' as PlannedPaymentId,
        name: 'Monthly Salary',
        amount: 5000,
        currencyCode: 'USD',
        fromAccountId: 'acc-employer' as AccountId,
        toAccountId: liquidAccountId,
        nextOccurrence: new Date('2026-04-10T00:00:00Z').getTime(),
        intervalType: PlannedPaymentInterval.MONTHLY,
        intervalN: 1,
        status: PlannedPaymentStatus.ACTIVE,
        isAutoPost: false,
      } as unknown as PlannedPayment;

      const rent = {
        id: 'pp-rent' as PlannedPaymentId,
        name: 'Apartment Rent',
        amount: 1500,
        currencyCode: 'USD',
        fromAccountId: liquidAccountId,
        toAccountId: rentExpenseAccountId,
        nextOccurrence: new Date('2026-04-05T00:00:00Z').getTime(),
        intervalType: PlannedPaymentInterval.MONTHLY,
        intervalN: 1,
        status: PlannedPaymentStatus.ACTIVE,
        isAutoPost: false,
      } as unknown as PlannedPayment;

      const transferToSavings = {
        id: 'pp-save' as PlannedPaymentId,
        name: 'Emergency Fund Transfer',
        amount: 500,
        currencyCode: 'USD',
        fromAccountId: liquidAccountId,
        toAccountId: savingsAccountId,
        nextOccurrence: new Date('2026-04-15T00:00:00Z').getTime(),
        intervalType: PlannedPaymentInterval.MONTHLY,
        intervalN: 1,
        status: PlannedPaymentStatus.ACTIVE,
        isAutoPost: false,
      } as unknown as PlannedPayment;

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([
          [liquidAccountId, 2000],
          [savingsAccountId, 1000],
        ]),
        liquidAssetIds: [liquidAccountId, savingsAccountId],
        liabilityAccountBalances: [],
        allAccounts: baseAccounts,
        budgets: [],
        usages: [],
        plannedPayments: [salary, rent, transferToSavings],
        plannedJournals: [],
        resultCurrency: 'USD',
        workplaceId,
        simulationDays: 30,
      });

      const plannedFlows = result.allFlows.filter(f => f.origin === FlowSource.PLANNED_PAYMENT);
      expect(plannedFlows.length).toBe(3);

      // Initial total liquid = 3000. Rent drops liquid by 1500 on day 4 (2000-1500=500 checking + 1000 savings = 1500 total).
      // Min trajectory before salary is 1500.
      expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1500);
      expect(result.simulationResult.summary.safeToSpend).toBe(1500);
    });

    it('LOCK 3: category overlap deduplication (Budget ₹20k + Planned ₹5k = ₹20k total, not ₹25k)', async () => {
      const budgetId = 'b-food' as BudgetId;
      const foodBudget = {
        id: budgetId,
        name: 'Food',
        amount: 600,
        currencyCode: 'USD',
        intervalType: 'MONTHLY',
        intervalN: 1,
        recurrenceDay: 1,
        assetAccountIds: liquidAccountId,
        workplaceId,
      } as unknown as Budget;

      const mealSubscription = {
        id: 'pp-meal' as PlannedPaymentId,
        name: 'Meal Subscription',
        amount: 150,
        currencyCode: 'USD',
        fromAccountId: liquidAccountId,
        toAccountId: foodExpenseAccountId, // Targets food expense category
        nextOccurrence: new Date('2026-04-10T00:00:00Z').getTime(),
        intervalType: PlannedPaymentInterval.MONTHLY,
        intervalN: 1,
        status: PlannedPaymentStatus.ACTIVE,
        isAutoPost: false,
      } as unknown as PlannedPayment;

      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId, accountId: foodExpenseAccountId, workplaceId },
      ]);

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 2000]]),
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        allAccounts: baseAccounts,
        budgets: [foodBudget],
        usages: [{ spent: 0, remaining: 600, budgetAmount: 600, usagePercent: 0 }],
        plannedPayments: [mealSubscription],
        plannedJournals: [],
        resultCurrency: 'USD',
        workplaceId,
        simulationDays: 30,
      });

      // Total effective food spend composes to $150 planned + $450 residual burn = $600 (not 600 + 150 = 750)
      // 2000 starting - 600 total projected food = 1400 SafeToSpend
      expect(result.simulationResult.summary.safeToSpend).toBe(1400);
      expect(result.simulationResult.summary.trajectoryMinBalance).toBe(1400);
    });

    it('LOCK 4: credit card statement obligation and settlement matching', async () => {
      (accountQueryRepository.findMetadataByAccountIds as jest.Mock).mockResolvedValue([
        {
          accountId: creditCardAccountId,
          statementDay: 15,
          dueDay: 5,
          payFromAccountId: liquidAccountId,
        },
      ]);

      (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
        new Map([[creditCardAccountId, 800]]),
      );

      const ccPayment = {
        id: 'pp-cc-pay' as PlannedPaymentId,
        name: 'Pay CC Bill',
        amount: 800,
        currencyCode: 'USD',
        fromAccountId: liquidAccountId,
        toAccountId: creditCardAccountId,
        nextOccurrence: new Date('2026-04-04T00:00:00Z').getTime(), // 1 day before due date
        intervalType: PlannedPaymentInterval.MONTHLY,
        intervalN: 1,
        status: PlannedPaymentStatus.ACTIVE,
        isAutoPost: false,
      } as unknown as PlannedPayment;

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 3000]]),
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [{ account: creditCardAccount, balance: 800 }],
        allAccounts: baseAccounts,
        budgets: [],
        usages: [],
        plannedPayments: [ccPayment],
        plannedJournals: [],
        resultCurrency: 'USD',
        workplaceId,
        simulationDays: 30,
      });

      // The transfer flow covers the statement obligation, preventing double-deduction
      const transferFlow = result.allFlows.find(f => f.kind === 'TRANSFER');
      expect(transferFlow).toBeDefined();
      expect(transferFlow?.amount).toBe(800);

      // 3000 starting - 800 payment = 2200
      expect(result.simulationResult.summary.safeToSpend).toBe(2200);
    });

    it('LOCK 5: mid-cycle simulation burns full remaining budget capacity before cycle end', async () => {
      // Simulation begins on Aug 22 (10 days remaining in Aug 1-31 cycle: Aug 22 to Aug 31)
      jest.setSystemTime(new Date('2026-08-22T00:00:00Z'));

      const midCycleBudget = {
        id: 'b-mid-cycle',
        name: 'Mid Cycle Food',
        amount: 10000,
        currencyCode: 'USD',
        assetAccountIds: liquidAccountId,
        intervalType: 'MONTHLY',
        intervalN: 1,
        recurrenceDay: 1,
      } as unknown as Budget;

      (budgetRepository.getScopesByBudgetIds as jest.Mock).mockResolvedValue([
        { budgetId: 'b-mid-cycle', accountId: foodExpenseAccountId, workplaceId },
      ]);

      const result = await cashFlowSimulationService.simulate({
        startingBalances: new Map([[liquidAccountId, 50000]]),
        liquidAssetIds: [liquidAccountId],
        liabilityAccountBalances: [],
        allAccounts: baseAccounts,
        budgets: [midCycleBudget],
        usages: [{ spent: 0, remaining: 10000, budgetAmount: 10000, usagePercent: 0 }],
        plannedPayments: [],
        plannedJournals: [],
        resultCurrency: 'USD',
        workplaceId,
        simulationDays: 30, // 10 days in Aug + 20 days in Sept
      });

      const flows = result.allFlows;
      const augFlows = flows.filter(f => f.dayOffset < 10);
      const septFlows = flows.filter(f => f.dayOffset >= 10);

      expect(augFlows).toHaveLength(10);
      expect(septFlows).toHaveLength(20);

      // Entire ₹10,000 remaining capacity is burned over the 10 remaining days of August (₹1,000/day)
      const augTotalBurn = augFlows.reduce((sum, f) => sum + f.amount, 0);
      expect(augTotalBurn).toBeCloseTo(10000, 2);
      expect(augFlows[0].amount).toBeCloseTo(1000, 2);

      // September burns at the full 30-day rate: 10000 / 30 = 333.33/day
      expect(septFlows[0].amount).toBeCloseTo(10000 / 30, 2);
      const septTotalBurn = septFlows.reduce((sum, f) => sum + f.amount, 0);
      expect(septTotalBurn).toBeCloseTo((10000 / 30) * 20, 2);

      // Safe to spend: 50,000 - (10,000 + 6,666.67) = 33,333.33
      expect(result.simulationResult.summary.safeToSpend).toBeCloseTo(
        50000 - (augTotalBurn + septTotalBurn),
        2,
      );
    });
  });
});
