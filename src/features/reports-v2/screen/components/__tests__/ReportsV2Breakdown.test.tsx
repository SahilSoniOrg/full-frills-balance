import { ReportsV2Breakdown } from '../ReportsV2Breakdown';
import { render, screen } from '@/src/utils/test-utils';

const EXCHANGE_RATE_MESSAGE =
  'Some cross-currency activity was omitted because no historical rate was available.';

describe('ReportsV2Breakdown', () => {
  it('shows the full health diagnostic instead of truncating it', () => {
    render(
      <ReportsV2Breakdown
        section={{
          id: 'health',
          title: 'Report health',
          rows: [
            {
              id: 'MISSING_EXCHANGE_RATE',
              label: EXCHANGE_RATE_MESSAGE,
              value: { kind: 'COUNT', value: 85 },
            },
          ],
        }}
        context={{
          periodLabel: 'This month',
          accountScopeLabel: 'All accounts',
          basisLabel: 'Actual',
          comparisonLabel: 'None',
          archivedAccountsLabel: 'Active only',
          currencyCode: 'INR',
        }}
        dataNotes={[]}
        onDrilldown={() => undefined}
      />,
    );

    const label = screen.getByText(EXCHANGE_RATE_MESSAGE);
    expect(label).toBeTruthy();
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('offers a scoped explanation for budget utilization', () => {
    render(
      <ReportsV2Breakdown
        section={{
          id: 'budgets',
          title: 'Budgets',
          rows: [
            {
              id: 'food',
              label: 'Food',
              value: { kind: 'MONEY', amount: 50, currencyCode: 'INR' },
              percentage: { kind: 'PERCENTAGE', value: 50 },
            },
          ],
        }}
        context={{
          periodLabel: 'This month',
          accountScopeLabel: 'All accounts',
          basisLabel: 'Actual',
          comparisonLabel: 'None',
          archivedAccountsLabel: 'Active only',
          currencyCode: 'INR',
        }}
        dataNotes={[]}
        onDrilldown={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Explain Budget utilization' })).toBeTruthy();
  });
});
