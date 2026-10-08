import { BudgetSpendingChart } from '../BudgetSpendingChart';
import { presentBudgetPeriod } from '../../helpers/budgetDetailPresentation';
import { act, cleanup, fireEvent, render as renderWithProviders } from '@/src/utils/test-utils';
import type { ReactElement } from 'react';
import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import { ChartInteractionProvider } from '@/src/components/charts/ChartInteractionProvider';
import { panGestures, tapGestures } from '@/src/testing/gestureMock';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: jest.requireActual('react-native').View,
  ScrollView: jest.requireActual('react-native').ScrollView,
  Swipeable: jest.requireActual('react-native').View,
  GestureHandlerRootView: jest.requireActual('react-native').View,
  Gesture: jest.requireActual('@/src/testing/gestureMock').Gesture,
}));
jest.mock('@/src/utils/haptics', () => ({ triggerHaptic: jest.fn() }));

function render(ui: ReactElement) {
  return renderWithProviders(<ChartInteractionProvider>{ui}</ChartInteractionProvider>);
}

function renderInteractiveChart() {
  const screen = render(
    <ChartInteractionProvider>
      <BudgetSpendingChart
        chartData={chartData}
        previousChartData={null}
        usage={chartUsage}
        currencyCode="USD"
        periodRange={periodRange}
        period={chartPeriod}
        now={chartNow}
        isCurrentPeriod
        isLoading={false}
        onRetry={jest.fn()}
      />
    </ChartInteractionProvider>,
  );
  fireEvent(screen.getByTestId('budget-spending-chart-layout'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 180, x: 0, y: 0 } },
  });
  return screen;
}

const startDate = new Date(2026, 9, 1).getTime();
const endDate = new Date(2026, 9, 31, 23, 59, 59, 999).getTime();
const periodRange = { startDate, endDate };
const chartUsage = { spent: 25, remaining: 75, budgetAmount: 100, usagePercent: 0.25 };
const chartNow = new Date(2026, 9, 15).getTime();
const chartPeriod = presentBudgetPeriod(periodRange, chartUsage, chartNow);
const chartData: BudgetCumulativeChart = {
  data: [
    { x: startDate, y: 0 },
    { x: new Date(2026, 9, 2, 9).getTime(), y: 0 },
    { x: new Date(2026, 9, 2, 9).getTime(), y: 25 },
    { x: endDate, y: 25 },
  ],
  domainX: [startDate, endDate],
  hasUnvaluedEntries: false,
  categories: [],
  entryCount: 1,
  refunds: 0,
};

describe('BudgetSpendingChart', () => {
  afterEach(cleanup);
  beforeEach(() => {
    panGestures.length = 0;
    tapGestures.length = 0;
    preferences.privacy.setIsPrivacyMode(false);
  });
  afterEach(() => preferences.privacy.setIsPrivacyMode(false));

  it('shows selected-day spending on tap and updates it while dragging', () => {
    const screen = renderInteractiveChart();
    expect(tapGestures.length).toBeGreaterThan(0);
    act(() => tapGestures.at(-1)!.handlers.onEnd?.({ x: 2, y: 50 }, true));
    expect(screen.getByTestId('budget-chart-tooltip')).toHaveTextContent(/Oct 1,/);
    expect(screen.getByTestId('budget-chart-tooltip')).toHaveTextContent(/Spent: \$0\.00/);
    act(() => {
      panGestures.at(-1)!.handlers.onStart?.({ x: 25, y: 50 }, true);
      panGestures.at(-1)!.handlers.onUpdate?.({ x: 145, y: 50 }, true);
      panGestures.at(-1)!.handlers.onFinalize?.({ x: 145, y: 50 }, true);
    });
    expect(screen.getByTestId('budget-chart-tooltip')).toHaveTextContent(/Oct 15,/);
    expect(screen.getByTestId('budget-chart-tooltip')).toHaveTextContent(/Spent: \$25\.00/);
    expect(panGestures.at(-1)!.config.failOffsetY).toEqual([-12, 12]);
  });

  it('masks selected spending in privacy mode', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = renderInteractiveChart();
    expect(tapGestures.length).toBeGreaterThan(0);
    act(() => tapGestures.at(-1)!.handlers.onEnd?.({ x: 145, y: 50 }, true));
    expect(screen.getByText(`Spent: ${AppConfig.privacyMask}`)).toBeTruthy();
    expect(screen.queryByText(/\$25\.00/)).toBeNull();
  });

  it('measures its chart area before paths exist, then renders the chart', () => {
    const screen = render(
      <BudgetSpendingChart
        chartData={chartData}
        previousChartData={null}
        usage={chartUsage}
        currencyCode="USD"
        periodRange={periodRange}
        period={chartPeriod}
        now={chartNow}
        isCurrentPeriod
        isLoading={false}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('budget-spending-chart-layout')).toBeTruthy();
    expect(screen.queryByRole('image')).toBeNull();
    fireEvent(screen.getByTestId('budget-spending-chart-layout'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 180, x: 0, y: 0 } },
    });

    expect(screen.getByLabelText(/period elapsed/)).toBeTruthy();
  });

  it('plots refunds below zero instead of flattening negative net spending', () => {
    const screen = render(
      <BudgetSpendingChart
        chartData={{
          ...chartData,
          data: chartData.data.map(point => ({ ...point, y: point.y === 0 ? 0 : -25 })),
        }}
        previousChartData={null}
        usage={{ spent: -25, remaining: 125, budgetAmount: 100, usagePercent: -0.25 }}
        currencyCode="USD"
        periodRange={periodRange}
        period={presentBudgetPeriod(
          periodRange,
          { spent: -25, remaining: 125, budgetAmount: 100, usagePercent: -0.25 },
          chartNow,
        )}
        now={chartNow}
        isCurrentPeriod
        isLoading={false}
        onRetry={jest.fn()}
      />,
    );
    fireEvent(screen.getByTestId('budget-spending-chart-layout'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 180, x: 0, y: 0 } },
    });
    expect(screen.getByTestId('budget-chart-today-dot').props.cy).toBeGreaterThan(
      screen.getByTestId('budget-chart-zero-baseline').props.y1,
    );
  });

  it.each([
    { isLoading: true },
    { error: 'Unavailable' },
    {
      usage: {
        spent: 25,
        remaining: 75,
        budgetAmount: 100,
        usagePercent: 0.25,
        hasUnvaluedEntries: true,
      },
    },
  ])('does not present a pace judgement when data is unavailable or partial', override => {
    const screen = render(
      <BudgetSpendingChart
        chartData={chartData}
        previousChartData={null}
        usage={chartUsage}
        currencyCode="USD"
        periodRange={periodRange}
        period={chartPeriod}
        now={chartNow}
        isCurrentPeriod
        isLoading={false}
        onRetry={jest.fn()}
        {...override}
      />,
    );
    expect(screen.queryByText(/under pace|over pace/)).toBeNull();
  });
});
