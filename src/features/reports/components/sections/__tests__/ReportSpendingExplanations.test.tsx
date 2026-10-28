import { ReportSpendingSection } from '../ReportSpendingSection';
import type {
  ReportBreakdownViewState,
  ReportSpendingTabVm,
} from '@/src/features/reports/hooks/reportTabTypes';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import type { ReactNode } from 'react';

jest.mock('@/src/components/charts/HeatmapChart', () => ({ HeatmapChart: () => null }));
jest.mock('@/src/components/charts/CalendarHeatmap', () => ({ CalendarHeatmap: () => null }));
jest.mock('@/src/components/overlays/InfoSheet', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    InfoSheet: ({
      visible,
      title,
      children,
      onClose,
      accessibilityCloseLabel,
    }: {
      visible: boolean;
      title: string;
      children: ReactNode;
      onClose: () => void;
      accessibilityCloseLabel: string;
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          {children}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityCloseLabel}
            onPress={onClose}
          >
            <Text>Close</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

const emptyBreakdown: ReportBreakdownViewState = {
  donutData: [],
  legendRows: [],
  totalCount: 0,
  showExpansionButton: false,
  hasData: false,
};

const vm = {
  expenseViewState: emptyBreakdown,
  expenseCategoryViewState: emptyBreakdown,
  incomeCategoryViewState: emptyBreakdown,
  expandedExpenses: false,
  toggleExpenseExpansion: jest.fn(),
  expandedExpenseCategories: false,
  toggleExpenseCategoryExpansion: jest.fn(),
  expandedIncomeCategories: false,
  toggleIncomeCategoryExpansion: jest.fn(),
  spendingHeatmap: [],
  calendarHeatmap: [],
  onLegendRowPress: jest.fn(),
  onHeatmapCellPress: jest.fn(),
  onViewTransactions: jest.fn(),
  targetCurrency: 'INR',
} as ReportSpendingTabVm;

describe('legacy spending heatmap explanations', () => {
  it('explains both heatmaps using the selected filters, units, and actual encodings', () => {
    render(
      <ReportSpendingSection
        vm={vm}
        chartWidth={320}
        explanationScope={{
          periodLabel: 'This month',
          accountScopeLabel: '2 Accounts',
          hasUnvaluedEntries: true,
        }}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Explain Spending heatmap' }));
    expect(
      screen.getByText(
        'Each cell sums debit transaction amounts from selected income and expense accounts for one weekday and local hour. Weekdays run Monday to Sunday.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('2 Accounts')).toBeTruthy();
    expect(screen.getByText('INR')).toBeTruthy();
    expect(
      screen.getByText(
        'Some transactions could not be valued or linked to report accounts and may be omitted.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Close Spending heatmap explanation' }));
    fireEvent.press(screen.getByRole('button', { name: 'Explain Activity calendar' }));
    expect(
      screen.getByText(
        "Each cell shows a report history bucket's net expense after refunds. Short ranges use daily buckets; longer ranges use monthly totals plotted at the bucket start date.",
      ),
    ).toBeTruthy();
  });
});
