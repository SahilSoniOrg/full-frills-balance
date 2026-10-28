import {
  explanationContextFromFilters,
  explanationContextItems,
  explanationForBudgetUtilization,
  explanationForMetric,
  explanationForVisualization,
  reportExplanationDataNotes,
} from '../reportExplanations';

describe('reports v2 explanations', () => {
  it('provides explanations for every displayed report metric', () => {
    const metricIdsBySection = {
      overview: ['gross-income', 'net-income', 'net-expense', 'net-flow', 'savings-rate'],
      'cash-flow': ['cash-inflows', 'cash-outflows', 'cash-net', 'opening-cash', 'closing-cash'],
      spending: ['gross-spending', 'refunds', 'net-spending', 'spending-journals', 'average-spend'],
      income: ['gross-income-detail', 'income-reversals', 'net-income-detail', 'income-journals'],
      'net-worth': ['assets', 'liabilities', 'net-worth', 'net-worth-change'],
      budgets: ['budgeted', 'budget-actual', 'budget-planned'],
      debt: [
        'debt-opening',
        'debt-closing',
        'debt-borrowings',
        'debt-payments',
        'debt-utilization',
      ],
      forecast: ['scheduled-inflows', 'scheduled-outflows', 'projected-closing-cash'],
      health: ['health-errors', 'health-warnings', 'health-info'],
    } as const;

    for (const [sectionId, metricIds] of Object.entries(metricIdsBySection)) {
      for (const metricId of metricIds) {
        expect(explanationForMetric(sectionId, metricId)).toBeDefined();
      }
    }
  });

  it('describes net flow and cash movement with their distinct formulas', () => {
    expect(explanationForMetric('overview', 'net-flow')?.meaning).toContain(
      'Net income minus net spending',
    );
    expect(explanationForMetric('cash-flow', 'cash-net')?.meaning).toContain(
      'Cash inflows minus cash outflows',
    );
    expect(explanationForMetric('cash-flow', 'cash-net')?.interpretation).toContain(
      'Transfers and borrowing count',
    );
  });

  it('explains budget utilization and unavailable zero-budget values', () => {
    const copy = explanationForBudgetUtilization();
    expect(copy.meaning).toContain('actual net spending divided by the budget amount');
    expect(copy.interpretation).toContain('Planned spending is excluded');
    expect(copy.interpretation).toContain('unavailable when the accrued budget is zero');
  });

  it('labels forecasts as projections and net worth history as reconstructed', () => {
    const forecast = explanationForMetric('forecast', 'projected-closing-cash');
    const history = explanationForVisualization('net-worth', {
      kind: 'LINE',
      series: [],
    });
    expect(forecast?.interpretation).toContain('projection, not a balance snapshot');
    expect(history?.interpretation).toContain('reconstructed history');
  });

  it('carries selected scope and data-quality notes into the explanation', () => {
    const context = explanationContextFromFilters({
      periodLabel: 'This month',
      accountScopeLabel: '2 accounts',
      basis: 'ACTUAL_PLUS_PLANNED',
      comparison: 'PREVIOUS_PERIOD',
      includeArchivedAccounts: true,
      targetCurrency: 'INR',
    });
    const rows = explanationContextItems(context, 'Actual balance snapshots');

    expect(rows).toEqual(
      expect.arrayContaining([
        { label: 'Period', value: 'This month' },
        { label: 'Accounts', value: '2 accounts' },
        { label: 'Activity basis', value: 'Actual + planned' },
        { label: 'Balance or forecast basis', value: 'Actual balance snapshots' },
      ]),
    );
    expect(
      reportExplanationDataNotes([
        {
          code: 'MISSING_EXCHANGE_RATE',
          severity: 'WARNING',
          message: 'rate missing',
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('entries without an available historical rate are omitted'),
      ]),
    );
  });
});
