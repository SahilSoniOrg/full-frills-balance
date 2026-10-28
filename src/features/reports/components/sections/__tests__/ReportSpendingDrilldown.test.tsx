import { ReportSpendingSection } from '../ReportSpendingSection';
import type { ReportSpendingTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import type { HeatmapPoint } from '@/src/services/reports/reportSnapshot';
import type { JournalId } from '@/src/types/ids';
import { formatDate } from '@/src/utils/dateUtils';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/charts/HeatmapChart', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    HeatmapChart: ({
      data,
      onCellPress,
    }: {
      data: HeatmapPoint[];
      onCellPress: (point: HeatmapPoint) => void;
    }) => (
      <Pressable
        accessibilityRole="button"
        testID="spending-heatmap-cell-action"
        onPress={() => onCellPress(data[0])}
      >
        <Text>Heatmap cell action</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/src/components/charts/CalendarHeatmap', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CalendarHeatmap: ({
      data,
      onCellPress,
    }: {
      data: HeatmapPoint[];
      onCellPress: (point: HeatmapPoint) => void;
    }) => (
      <Pressable
        accessibilityRole="button"
        testID="calendar-day-action"
        onPress={() => onCellPress(data[0])}
      >
        <Text>Calendar day action</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/src/components/shared/ContextualExplanation', () => ({
  ContextualExplanation: () => null,
}));

const emptyBreakdown = {
  donutData: [],
  legendRows: [],
  totalCount: 0,
  showExpansionButton: false,
  hasData: false,
};

describe('legacy spending visual drill-downs', () => {
  it('routes heatmap cells and calendar days through the report actions', () => {
    const periodStart = new Date(2025, 10, 1).getTime();
    const periodEnd = new Date(2025, 10, 30, 23, 59, 59, 999).getTime();
    const heatmapPoint: HeatmapPoint = {
      x: 0,
      y: 9,
      value: 120,
      journalIds: ['journal-1' as JournalId],
    };
    const calendarPoint: HeatmapPoint = {
      x: 1,
      y: 0,
      value: 45,
      label: '5',
      timestamp: periodStart,
      periodEndTimestamp: periodEnd,
    };
    const onHeatmapCellPress = jest.fn();
    const onViewTransactions = jest.fn();
    const vm: ReportSpendingTabVm = {
      expenseViewState: emptyBreakdown,
      expenseCategoryViewState: emptyBreakdown,
      incomeCategoryViewState: emptyBreakdown,
      expandedExpenses: false,
      toggleExpenseExpansion: jest.fn(),
      expandedExpenseCategories: false,
      toggleExpenseCategoryExpansion: jest.fn(),
      expandedIncomeCategories: false,
      toggleIncomeCategoryExpansion: jest.fn(),
      spendingHeatmap: [heatmapPoint],
      calendarHeatmap: [calendarPoint],
      onLegendRowPress: jest.fn(),
      onHeatmapCellPress,
      onViewTransactions,
      targetCurrency: 'INR',
    };

    render(
      <ReportSpendingSection
        vm={vm}
        chartWidth={320}
        explanationScope={{
          periodLabel: 'This month',
          accountScopeLabel: 'All accounts',
          hasUnvaluedEntries: false,
        }}
      />,
    );

    fireEvent.press(screen.getByTestId('spending-heatmap-cell-action'));
    fireEvent.press(screen.getByTestId('calendar-day-action'));

    expect(onHeatmapCellPress).toHaveBeenCalledWith(heatmapPoint);
    expect(onViewTransactions).toHaveBeenCalledWith(
      periodStart,
      periodEnd,
      `Period: ${formatDate(periodStart)} – ${formatDate(periodEnd)}`,
    );
  });
});
