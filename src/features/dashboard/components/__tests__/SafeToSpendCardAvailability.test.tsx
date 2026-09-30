import { AppConfig } from '@/src/constants';
import { SafeToSpendCard } from '@/src/features/dashboard/components/SafeToSpendCard';
import type { SafeToSpendViewModel } from '@/src/features/dashboard/types/SafeToSpendViewModel';
import { render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'test-workplace' }),
}));
jest.mock('@/src/components/shared/moneyFormat', () => ({
  useMoneyFormat: () => () => 'USD 0.00',
}));

describe('SafeToSpendCard availability', () => {
  it('hides zero-valued financial output when projection is unavailable', () => {
    render(
      <SafeToSpendCard
        quality="unavailable"
        projection={{ history: [], projection: [], safeDaysCount: null, safeToSpend: 0 }}
        viewModel={
          {
            safeToSpend: 0,
            shortfall: 0,
            committedTotal: 0,
            effectiveTotal: 0,
            committedLiabilities: 0,
            currencyCode: 'USD',
            isOverCommitted: false,
            isPositiveSafeToSpend: true,
            isLoading: false,
            hasUnvaluedEntries: false,
          } as SafeToSpendViewModel
        }
        onInfoPress={() => undefined}
        onLegendPress={() => undefined}
      />,
    );
    expect(
      screen.getByText(AppConfig.strings.dashboard.safeToSpendUi.forecastUnavailable),
    ).toBeTruthy();
    expect(screen.queryByTestId('safe-to-spend-amount')).toBeNull();
  });
});
