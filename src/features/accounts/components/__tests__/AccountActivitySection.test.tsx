import {
  AccountActivitySection,
  type AccountActivitySectionProps,
} from '../AccountActivitySection';
import * as privacy from '@/src/contexts/PrivacyScope';
import { LineChart } from '@/src/components/charts/LineChart';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AccountType } from '@/src/types/enums';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/charts/LineChart', () => ({ LineChart: jest.fn(() => null) }));

const props: AccountActivitySectionProps = {
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
  dateRange: null,
  onShowDatePicker: jest.fn(),
  chartData: [],
  rollingAverageData: [],
  xTicks: [],
  periodMetrics: {
    totalIncrease: 0,
    totalDecrease: 0,
    netChange: 0,
    dailyAverage: null,
    isLoading: false,
  },
  previousPeriod: null,
};

describe('AccountActivitySection chart disclosure', () => {
  afterEach(() => jest.restoreAllMocks());

  it('starts collapsed and expands only when requested', () => {
    render(
      <AccountActivitySection
        {...props}
        chartData={[
          { x: 0, y: 10 },
          { x: 1, y: 20 },
        ]}
      />,
    );

    expect(screen.queryByTestId('account-trend-chart')).toBeNull();
    expect(screen.getByTestId('account-trend-toggle').props.accessibilityState.expanded).toBe(
      false,
    );

    fireEvent.press(screen.getByLabelText('Show balance over time chart'));
    expect(screen.getByTestId('account-trend-chart')).toBeTruthy();
    expect(screen.getByTestId('account-trend-toggle').props.accessibilityState.expanded).toBe(true);

    fireEvent.press(screen.getByLabelText('Hide balance over time chart'));
    expect(screen.queryByTestId('account-trend-chart')).toBeNull();
  });

  it('honors an explicitly expanded initial chart', () => {
    render(
      <AccountActivitySection
        {...props}
        initialChartExpanded={true}
        chartData={[
          { x: 0, y: 10 },
          { x: 1, y: 20 },
        ]}
      />,
    );

    expect(screen.getByTestId('account-trend-chart')).toBeTruthy();
    expect(screen.getByTestId('account-trend-toggle').props.accessibilityState.expanded).toBe(true);
  });

  it('omits trend disclosure when there are no chart points', () => {
    render(<AccountActivitySection {...props} />);
    expect(screen.queryByTestId('account-trend-toggle')).toBeNull();
  });

  it('renders the liability repayment bar', () => {
    render(
      <AccountActivitySection
        {...props}
        accountType={AccountType.LIABILITY}
        periodMetrics={{
          totalIncrease: 1000,
          totalDecrease: 400,
          netChange: 600,
          dailyAverage: 20,
          isLoading: false,
        }}
      />,
    );

    expect(screen.getByTestId('account-period-bar')).toBeTruthy();
    expect(screen.getByText('Paid 40% of new charges')).toBeTruthy();
  });

  it('shows the earlier-period comparison even when there are no other stats', () => {
    render(
      <AccountActivitySection
        {...props}
        accountType={AccountType.EXPENSE}
        periodMetrics={{
          totalIncrease: 500,
          totalDecrease: 0,
          netChange: 500,
          dailyAverage: null,
          isLoading: false,
        }}
        previousPeriod={{ label: 'Sep total', netChange: 400 }}
      />,
    );

    expect(screen.getByText('Sep total')).toBeTruthy();
  });

  it('hides the repayment bar and its geometry in privacy mode', () => {
    jest.spyOn(privacy, 'useEffectivePrivacyMode').mockReturnValue(true);
    render(
      <AccountActivitySection
        {...props}
        accountType={AccountType.LIABILITY}
        periodMetrics={{
          totalIncrease: 1000,
          totalDecrease: 400,
          netChange: 600,
          dailyAverage: 20,
          isLoading: false,
        }}
      />,
    );
    expect(screen.queryByTestId('account-period-bar')).toBeNull();
    expect(screen.queryByText('Paid 40% of new charges')).toBeNull();
  });

  it('includes opening-day category entries in tooltip change', () => {
    const start = new Date(2024, 8, 1).getTime();
    render(
      <AccountActivitySection
        {...props}
        accountType={AccountType.EXPENSE}
        dateRange={{ startDate: start, endDate: new Date(2024, 8, 30).getTime() }}
        initialChartExpanded
        chartData={[
          { x: start, y: 30 },
          { x: start + 86400000, y: 75 },
        ]}
      />,
    );
    const chartWrap = screen
      .getByTestId('account-trend-chart')
      .findAll(node => typeof node.props.onLayout === 'function')[0];
    fireEvent(chartWrap, 'layout', { nativeEvent: { layout: { width: 320 } } });
    const tooltip = jest.mocked(LineChart).mock.calls.at(-1)?.[0].renderTooltipContent?.(0);
    expect(tooltip).toBeTruthy();
    render(<>{tooltip}</>);
    expect(screen.UNSAFE_getAllByType(MoneyText).map(amount => amount.props.amount)).toEqual([
      30, 30,
    ]);
  });
});
