import { ReportWealthSection } from '../ReportWealthSection';
import type { ReportWealthTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import type { BarChartDataPoint } from '@/src/components/charts/BarChart';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/charts/AreaChart', () => ({ AreaChart: () => null }));
jest.mock('@/src/components/charts/BarChart', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BarChart: ({
      data,
      selectedIndex,
      onPress,
      renderTooltipContent,
    }: {
      data: BarChartDataPoint[];
      selectedIndex?: number;
      onPress?: (index: number) => void;
      renderTooltipContent?: (index: number) => React.ReactNode;
    }) => (
      <>
        <Pressable
          accessibilityRole="button"
          testID="select-wealth-period"
          onPress={() => onPress?.(0)}
        >
          <Text>{data[0]?.label}</Text>
        </Pressable>
        {selectedIndex !== undefined ? renderTooltipContent?.(selectedIndex) : null}
      </>
    ),
  };
});
jest.mock('@/src/features/reports/components/ReportTooltip', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    IncomeExpenseTooltipContent: ({
      label,
      onViewTransactions,
    }: {
      label: string;
      onViewTransactions: () => void;
    }) => (
      <Pressable
        accessibilityRole="button"
        testID="view-wealth-period-transactions"
        onPress={onViewTransactions}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
    NetWorthTooltipContent: () => null,
  };
});

describe('legacy wealth chart period drill-down', () => {
  it('opens the selected chart period through the report transaction action', () => {
    const onViewTransactions = jest.fn();
    const startDate = 1706745600000;
    const endDate = 1709251199999;
    const vm: ReportWealthTabVm = {
      wealthAreaSeries: [[], []],
      barChartData: [
        {
          label: 'Feb',
          values: [800, 300],
          colors: ['green', 'red'],
          startDate,
          endDate,
        },
      ],
      dailyData: [],
      targetCurrency: 'EUR',
      onViewTransactions,
    };

    render(
      <ReportWealthSection
        vm={vm}
        chartWidth={320}
        explanationScope={{ periodLabel: 'Custom', accountScopeLabel: 'All accounts' }}
      />,
    );
    fireEvent.press(screen.getByTestId('select-wealth-period'));
    fireEvent.press(screen.getByTestId('view-wealth-period-transactions'));

    expect(onViewTransactions).toHaveBeenCalledWith(startDate, endDate, 'Period: Feb');
  });
});
