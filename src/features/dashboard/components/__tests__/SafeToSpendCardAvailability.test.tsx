import { AppConfig } from '@/src/constants';
import { SafeToSpendCard } from '@/src/features/dashboard/components/SafeToSpendCard';
import type { SafeToSpendViewModel } from '@/src/features/dashboard/types/SafeToSpendViewModel';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'test-workplace' }),
}));
jest.mock('@/src/components/shared/moneyFormat', () => ({
  useMoneyFormat: () => () => 'USD 0.00',
  useStsMoneyFormat: () => (amount: number, currency: string) => `${currency} ${amount}`,
}));

const viewModel = {
  safeToSpend: 150,
  shortfall: 0,
  committedTotal: 50,
  effectiveTotal: 200,
  committedLiabilities: 0,
  currencyCode: 'USD',
  isOverCommitted: false,
  isPositiveSafeToSpend: true,
  isLoading: false,
  hasUnvaluedEntries: false,
  safeToSpendDays: 30,
} as SafeToSpendViewModel;

const projection = { history: [], projection: [], safeDaysCount: null, safeToSpend: 150 };
const populatedProjection = {
  ...projection,
  projection: [{ timestamp: Date.UTC(2026, 9, 2), value: 200, details: [], isProjected: true }],
};

describe('SafeToSpendCard availability', () => {
  it('hides zero-valued financial output when projection is unavailable', () => {
    render(
      <SafeToSpendCard
        quality="unavailable"
        projection={{ history: [], projection: [], safeDaysCount: null, safeToSpend: 0 }}
        viewModel={{ ...viewModel, safeToSpend: 0, effectiveTotal: 0 }}
        onInfoPress={() => undefined}
        onLegendPress={() => undefined}
      />,
    );
    expect(
      screen.getByText(AppConfig.strings.dashboard.safeToSpendUi.forecastUnavailable),
    ).toBeTruthy();
    expect(screen.queryByTestId('safe-to-spend-amount')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forecast details' })).toBeNull();
  });

  it('shows the amount and interactive calculation details immediately', () => {
    const onLegendPress = jest.fn();
    render(
      <SafeToSpendCard
        projection={projection}
        viewModel={viewModel}
        onInfoPress={jest.fn()}
        onLegendPress={onLegendPress}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Forecast details' })).toBeNull();
    expect(screen.getByTestId('safe-to-spend-amount')).toBeTruthy();
    expect(screen.getByText('After commitments over 30 days')).toBeTruthy();
    expect(screen.getByTestId('safe-to-spend-breakdown-metrics')).toBeTruthy();
    fireEvent.press(screen.getByText('Reserved:'));
    expect(onLegendPress).toHaveBeenCalledWith('committed');
  });

  it('keeps stale and incomplete valuation warnings alongside the breakdown', () => {
    render(
      <SafeToSpendCard
        quality="stale"
        projection={projection}
        viewModel={{ ...viewModel, hasUnvaluedEntries: true, asOf: Date.UTC(2026, 9, 2) }}
        onInfoPress={jest.fn()}
        onLegendPress={jest.fn()}
      />,
    );
    expect(screen.getByText(AppConfig.strings.dashboard.safeToSpendUi.forecastStale)).toBeTruthy();
    expect(screen.getByTestId('safe-to-spend-incomplete-warning')).toBeTruthy();
    expect(screen.getByText(/Based on/)).toBeTruthy();
    expect(screen.getByTestId('safe-to-spend-breakdown-metrics')).toBeTruthy();
  });

  it('shows the projection and breakdown together without a disclosure', () => {
    render(
      <SafeToSpendCard
        projection={populatedProjection}
        viewModel={viewModel}
        onInfoPress={jest.fn()}
        onLegendPress={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Forecast details' })).toBeNull();
    expect(screen.getAllByText('Projection (30-day)')).toHaveLength(1);
    expect(screen.getByTestId('safe-to-spend-breakdown-metrics')).toBeTruthy();
  });

  it('hides the graph when forecast data is unavailable', () => {
    render(
      <SafeToSpendCard
        quality="unavailable"
        projection={populatedProjection}
        viewModel={viewModel}
        onInfoPress={jest.fn()}
        onLegendPress={jest.fn()}
      />,
    );
    expect(screen.queryByText('Projection (30-day)')).toBeNull();
  });

  it('respects the saved chart preference while keeping the breakdown visible', () => {
    render(
      <SafeToSpendCard
        showChart={false}
        projection={populatedProjection}
        viewModel={viewModel}
        onInfoPress={jest.fn()}
        onLegendPress={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Forecast details' })).toBeNull();
    expect(screen.getByTestId('safe-to-spend-breakdown-metrics')).toBeTruthy();
    expect(screen.queryByText('Projection (30-day)')).toBeNull();
  });
});
