import { BudgetSpendingChart } from '../BudgetSpendingChart';
import { presentBudgetPeriod } from '../../helpers/budgetDetailPresentation';
import { cleanup, fireEvent, render } from '@/src/utils/test-utils';
import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';

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
