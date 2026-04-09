import { simulationV2Adapter } from '@/src/services/simulation/v2/SimulationV2Adapter';
import { cashFlowSimulationServiceV2 } from '@/src/services/simulation/v2/CashFlowSimulationServiceV2';

jest.mock('@/src/services/simulation/v2/CashFlowSimulationServiceV2', () => ({
  cashFlowSimulationServiceV2: {
    simulate: jest.fn(),
  },
}));

describe('SimulationV2Adapter', () => {
  const cash = {
    id: 'cash',
    name: 'Checking',
    accountType: 'ASSET',
    accountSubtype: 'CHECKING',
    currencyCode: 'USD',
  } as any;

  const rent = {
    id: 'exp-rent',
    name: 'Rent',
    accountType: 'EXPENSE',
    currencyCode: 'USD',
  } as any;

  const groceries = {
    id: 'exp-groceries',
    name: 'Groceries',
    accountType: 'EXPENSE',
    currencyCode: 'USD',
  } as any;

  const cc = {
    id: 'cc',
    name: 'Credit Card',
    accountType: 'LIABILITY',
    accountSubtype: 'CREDIT_CARD',
    currencyCode: 'USD',
  } as any;

  const loan = {
    id: 'loan',
    name: 'Loan',
    accountType: 'LIABILITY',
    accountSubtype: 'LOAN',
    currencyCode: 'USD',
  } as any;

  const makeProjection = (dayOffset: number, globalBalance: number, flows: any[] = []) => ({
    timestamp: 0,
    dayOffset,
    globalBalance,
    accountBalances: new Map<string, number>(),
    flows,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('groups committed and debt breakdowns by target account instead of paying cash account', async () => {
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));

    const flows = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 200,
        dayOffset: 0,
        meta: {
          source: 'PLANNED',
          label: 'Rent payment',
          categoryId: 'exp-rent',
          referenceId: 'pp-rent',
        },
      },
      {
        kind: 'TRANSFER',
        fromAccountId: 'cash',
        toAccountId: 'cc',
        amount: 150,
        dayOffset: 0,
        meta: { source: 'PLANNED', label: 'Card payment', categoryId: 'cc', referenceId: 'pp-cc' },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 20,
        dayOffset: 0,
        meta: {
          source: 'BUDGET',
          label: 'Groceries Budget',
          categoryId: 'exp-groceries',
          referenceId: 'b-groceries',
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 50,
        dayOffset: 1,
        meta: { source: 'LIABILITY', label: 'Current bill: Credit Card', referenceId: 'cc' },
      },
    ];

    (cashFlowSimulationServiceV2.simulate as jest.Mock).mockResolvedValue({
      summary: {
        safeToSpend: 580,
        shortfall: 0,
        trajectoryMinBalance: 580,
        accountMinBalances: new Map([['cash', 580]]),
        accountMinBalancesBeforeIncome: new Map([['cash', 580]]),
        firstMajorInflowDay: null,
      },
      accountSummaries: [],
      projections: [
        makeProjection(0, 630, flows.slice(0, 3)),
        makeProjection(1, 580, flows.slice(3)),
      ],
      allFlows: flows,
    });

    const result = await simulationV2Adapter.simulate(
      new Map([['cash', 800]]),
      [],
      [],
      ['cash'],
      [{ account: cc, balance: 200 }],
      [],
      [],
      [cash, rent, groceries, cc],
      'USD',
    );

    expect(result.breakdowns.committed.map(entry => entry.accountId).sort()).toEqual([
      'cc',
      'exp-groceries',
      'exp-rent',
    ]);
    expect(result.breakdowns.committed.find(entry => entry.accountId === 'cc')?.amount).toBe(200);
    expect(result.breakdowns.debt).toEqual([
      expect.objectContaining({
        accountId: 'cc',
        accountName: 'Credit Card',
        amount: 50,
      }),
    ]);
    expect(result.metadata.committedSubtypes).toEqual(['CREDIT_CARD']);
    expect(result.breakdowns.liabilities.committedCreditCard).toBe(50);
    expect(result.breakdowns.liabilities.committedOther).toBe(0);
  });

  it('rebuilds projection metadata, safeDaysCount, and budget month splits for legacy consumers', async () => {
    jest.setSystemTime(new Date('2026-03-20T00:00:00Z'));

    const day0Budget = {
      kind: 'OUTFLOW',
      accountId: 'cash',
      amount: 10,
      dayOffset: 0,
      meta: {
        source: 'BUDGET',
        label: 'Groceries Budget',
        categoryId: 'exp-groceries',
        referenceId: 'b-groceries',
      },
    };
    const day0Planned = {
      kind: 'OUTFLOW',
      accountId: 'cash',
      amount: 40,
      dayOffset: 0,
      meta: {
        source: 'PLANNED',
        label: 'Rent payment',
        categoryId: 'exp-rent',
        referenceId: 'pp-rent',
      },
    };
    const day1SmallInflow = {
      kind: 'INFLOW',
      accountId: 'cash',
      amount: 100,
      dayOffset: 1,
      meta: { source: 'PLANNED', label: 'Small inflow', referenceId: 'pp-small' },
    };
    const day15Budget = {
      kind: 'OUTFLOW',
      accountId: 'cash',
      amount: 5,
      dayOffset: 15,
      meta: {
        source: 'BUDGET',
        label: 'Groceries Budget',
        categoryId: 'exp-groceries',
        referenceId: 'b-groceries',
      },
    };

    const allFlows = [day0Budget, day0Planned, day1SmallInflow, day15Budget];

    (cashFlowSimulationServiceV2.simulate as jest.Mock).mockResolvedValue({
      summary: {
        safeToSpend: 0,
        shortfall: 10,
        trajectoryMinBalance: -10,
        accountMinBalances: new Map([['cash', -10]]),
        accountMinBalancesBeforeIncome: new Map([['cash', -10]]),
        firstMajorInflowDay: 4,
      },
      accountSummaries: [],
      projections: [
        makeProjection(0, 50, [day0Budget, day0Planned]),
        makeProjection(1, -10, [day1SmallInflow]),
      ],
      allFlows,
    });

    const result = await simulationV2Adapter.simulate(
      new Map([['cash', 100]]),
      [],
      [],
      ['cash'],
      [],
      [],
      [],
      [cash, rent, groceries],
      'USD',
    );

    expect(result.summary.safeDaysCount).toBe(2);
    expect(result.summary.firstMajorInflowDay).toBe(4);
    expect(result.metadata.firstMajorInflowDay).toBe(4);
    expect(result.projections.dailyBudgetBurns[0]).toBe(10);
    expect(result.projections.dailyBudgetBurns[15]).toBe(5);
    expect(result.projections.flowByDayOffset.get(0)).toBe(-40);
    expect(result.projections.safeToSpendDailyBreakdown.get(0)).toEqual([
      expect.objectContaining({
        name: 'Rent payment',
        amount: 40,
        type: 'OUTFLOW',
      }),
    ]);
    expect(result.breakdowns.budget.currentMonthRemaining).toBe(10);
    expect(result.breakdowns.budget.nextMonthProjected).toBe(5);
    expect(result.breakdowns.budget.nextMonthDays).toBe(18);
  });

  it('preserves planned totals across transfers and planned-origin resolved flows', async () => {
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));

    const flows = [
      {
        kind: 'TRANSFER',
        fromAccountId: 'cash',
        toAccountId: 'cc',
        amount: 150,
        dayOffset: 0,
        meta: { source: 'PLANNED', label: 'Card payment', categoryId: 'cc', referenceId: 'pp-cc' },
      },
      {
        kind: 'INFLOW',
        accountId: 'cash',
        amount: 40,
        dayOffset: 1,
        meta: { source: 'PLANNED', label: 'Refund', referenceId: 'pp-refund' },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 80,
        dayOffset: 2,
        meta: {
          source: 'RESOLVED',
          originalSource: 'PLANNED',
          label: 'Rent payment',
          categoryId: 'exp-rent',
          referenceId: 'pp-rent',
        },
      },
      {
        kind: 'OUTFLOW',
        accountId: 'cash',
        amount: 25,
        dayOffset: 2,
        meta: { source: 'LIABILITY', label: 'Loan due', referenceId: 'loan' },
      },
    ];

    (cashFlowSimulationServiceV2.simulate as jest.Mock).mockResolvedValue({
      summary: {
        safeToSpend: 285,
        shortfall: 0,
        trajectoryMinBalance: 285,
        accountMinBalances: new Map([['cash', 285]]),
        accountMinBalancesBeforeIncome: new Map([['cash', 285]]),
        firstMajorInflowDay: null,
      },
      accountSummaries: [],
      projections: [
        makeProjection(0, 350, [flows[0]]),
        makeProjection(1, 390, [flows[1]]),
        makeProjection(2, 285, [flows[2], flows[3]]),
      ],
      allFlows: flows,
    });

    const result = await simulationV2Adapter.simulate(
      new Map([['cash', 500]]),
      [],
      [],
      ['cash'],
      [
        { account: cc, balance: 150 },
        { account: loan, balance: 25 },
      ],
      [],
      [],
      [cash, rent, cc, loan],
      'USD',
    );

    expect(result.summary.totalOrganicInflow).toBe(190);
    expect(result.summary.totalOrganicOutflow).toBe(230);
    expect(result.summary.totalCommittedPlanned).toBe(230);
    expect(result.summary.totalFutureInflow).toBe(190);
  });
});
