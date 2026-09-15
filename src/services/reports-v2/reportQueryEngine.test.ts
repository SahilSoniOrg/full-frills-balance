import { buildSections, ReportsV2Engine } from './reportQueryEngine';
import type { ReportQuery } from './types/query';
import { asWorkplaceId } from '@/src/types/ids';

describe('Reports V2 result rows', () => {
  it('runs section gating through the reader-to-engine seam', async () => {
    const query: ReportQuery = {
      workplaceId: asWorkplaceId('workplace-1'),
      period: { startDate: 0, endDate: 1, timeZone: 'UTC' },
      targetCurrency: 'INR',
      basis: 'ACTUAL',
      comparison: 'NONE',
      granularity: 'AUTO',
      sections: ['spending'],
    } as const;
    const inputReader = jest.fn(async () => ({
      snapshot: { actualFacts: [], plannedFacts: [], accounts: [], warnings: [] },
      period: query.period,
      comparisonPeriod: null,
      currentFacts: [],
      comparisonFacts: undefined,
      opening: { balances: [], warnings: [] },
      closing: { balances: [], warnings: [] },
      cashBalances: { openingBalances: [], closingBalances: [] },
      cashAccountIds: [],
      budgetRead: { budgets: [], warnings: [] },
      healthSnapshot: { actualFacts: [], plannedFacts: [], accounts: [], warnings: [] },
      planningAccounts: [],
      healthAccounts: [],
    }));
    const engine = new ReportsV2Engine(inputReader);

    const result = await engine.run(query);

    expect(inputReader).toHaveBeenCalledWith(query);
    expect(result.sections.map(section => section.id)).toEqual(['spending']);
  });

  it('preserves unavailable percentages instead of converting them to zero', () => {
    const query = {
      workplaceId: 'workplace-1',
      period: { startDate: 0, endDate: 1, timeZone: 'UTC' },
      targetCurrency: 'INR',
      basis: 'ACTUAL',
      comparison: 'NONE',
      granularity: 'AUTO',
    } as unknown as ReportQuery;
    const result = buildSections(
      query,
      {
        grossIncome: 0,
        netIncome: 0,
        netExpense: 0,
        netFlow: 0,
        savingsRate: null,
        buckets: [],
        topSpendingCategories: [],
        comparison: null,
      } as never,
      {
        cashInflows: 0,
        cashOutflows: 0,
        netCashFlow: 0,
        openingCashBalance: 0,
        closingCashBalance: 0,
        buckets: [],
        bySubtype: [],
      } as never,
      {
        grossExpense: 0,
        refunds: 0,
        netExpense: 0,
        journalCount: 0,
        averageTransactionSize: 0,
        buckets: [],
        bySubtype: [],
      } as never,
      {
        grossIncome: 0,
        incomeReversals: 0,
        netIncome: 0,
        journalCount: 0,
        buckets: [],
        bySubtype: [],
      } as never,
      { closing: null, change: { netWorth: 0 }, history: [] } as never,
      {
        totals: { budgetedAmount: 0, actualNetExpense: 0, plannedNetExpense: 0 },
        budgets: [],
      } as never,
      {
        totals: {
          openingBalance: 0,
          closingBalance: 0,
          borrowings: 0,
          totalPayments: 0,
          utilizationPercent: null,
        },
        accounts: [],
      } as never,
      {
        totals: { plannedInflow: 0, plannedOutflow: 0, endingProjectedBalance: 0 },
        timeline: [],
        upcoming: [],
      } as never,
      { summary: { errorCount: 0, warningCount: 0, infoCount: 0 }, diagnostics: [] } as never,
    );

    expect(
      result.sections
        .find(section => section.id === 'overview')
        ?.metrics?.find(metric => metric.id === 'savings-rate')?.value,
    ).toEqual({
      kind: 'PERCENTAGE',
      value: null,
    });
  });

  it('keeps report-health diagnostics as counts instead of currency', () => {
    const query = {
      workplaceId: 'workplace-1',
      period: { startDate: 0, endDate: 1, timeZone: 'UTC' },
      targetCurrency: 'INR',
      basis: 'ACTUAL',
      comparison: 'NONE',
      granularity: 'AUTO',
    } as unknown as ReportQuery;
    const health = {
      summary: { errorCount: 2, warningCount: 0, infoCount: 0 },
      diagnostics: [
        {
          code: 'UNBALANCED_JOURNAL',
          severity: 'ERROR',
          message: 'A journal does not balance to zero.',
          count: 2,
          journalIds: ['journal-1', 'journal-2'],
        },
      ],
    };
    const additionalWarnings = [
      {
        code: 'MISSING_EXCHANGE_RATE' as const,
        severity: 'WARNING' as const,
        message: 'Some cross-currency activity was omitted.',
        count: 3,
      },
    ];
    const emptyOverview = {
      grossIncome: 0,
      netIncome: 0,
      netExpense: 0,
      netFlow: 0,
      savingsRate: null,
      buckets: [],
      topSpendingCategories: [],
      comparison: null,
    };
    const emptyCashFlow = {
      cashInflows: 0,
      cashOutflows: 0,
      netCashFlow: 0,
      openingCashBalance: 0,
      closingCashBalance: 0,
      buckets: [],
      bySubtype: [],
    };
    const emptySpending = {
      grossExpense: 0,
      refunds: 0,
      netExpense: 0,
      journalCount: 0,
      averageTransactionSize: 0,
      buckets: [],
      bySubtype: [],
    };
    const emptyIncome = {
      grossIncome: 0,
      incomeReversals: 0,
      netIncome: 0,
      journalCount: 0,
      buckets: [],
      bySubtype: [],
    };
    const emptyNetWorth = { closing: null, change: { netWorth: 0 }, history: [] };
    const emptyBudget = {
      totals: { budgetedAmount: 0, actualNetExpense: 0, plannedNetExpense: 0 },
      budgets: [],
    };
    const emptyDebt = {
      totals: {
        openingBalance: 0,
        closingBalance: 0,
        borrowings: 0,
        totalPayments: 0,
        utilizationPercent: null,
      },
      accounts: [],
    };
    const emptyForecast = {
      totals: { plannedInflow: 0, plannedOutflow: 0, endingProjectedBalance: 0 },
      timeline: [],
      upcoming: [],
    };

    const result = buildSections(
      query,
      emptyOverview as never,
      emptyCashFlow as never,
      emptySpending as never,
      emptyIncome as never,
      emptyNetWorth as never,
      emptyBudget as never,
      emptyDebt as never,
      emptyForecast as never,
      health as never,
      additionalWarnings,
    );
    const healthRow = result.sections.find(section => section.id === 'health')?.rows?.[0];
    const healthWarnings = result.sections
      .find(section => section.id === 'health')
      ?.metrics?.find(metric => metric.id === 'health-warnings');

    expect(healthRow?.value).toEqual({ kind: 'COUNT', value: 2 });
    expect(healthWarnings?.value).toEqual({ kind: 'COUNT', value: 3 });
  });

  it('builds only the requested report sections', () => {
    const query = {
      workplaceId: 'workplace-1',
      period: { startDate: 0, endDate: 1, timeZone: 'UTC' },
      targetCurrency: 'INR',
      basis: 'ACTUAL',
      comparison: 'NONE',
      granularity: 'AUTO',
      sections: ['spending'],
    } as unknown as ReportQuery;

    const result = buildSections(
      query,
      undefined,
      undefined,
      {
        grossExpense: 10,
        refunds: 0,
        netExpense: 10,
        journalCount: 1,
        averageTransactionSize: 10,
        buckets: [],
        bySubtype: [],
      } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(result.sections.map(section => section.id)).toEqual(['spending']);
    expect(result.measures).toEqual(
      expect.objectContaining({
        grossSpending: { kind: 'MONEY', amount: 10, currencyCode: 'INR' },
      }),
    );
    expect(result.measures).not.toHaveProperty('grossIncome');
  });
});
