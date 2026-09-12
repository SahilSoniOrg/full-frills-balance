import { buildSections } from './reportQueryEngine';
import type { ReportQuery } from './types/query';

describe('Reports V2 result rows', () => {
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
});
