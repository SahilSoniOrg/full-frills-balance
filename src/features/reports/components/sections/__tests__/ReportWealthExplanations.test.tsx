import { ReportWealthSection } from '../ReportWealthSection';
import type { ReportWealthTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import type { ReactNode } from 'react';

jest.mock('@/src/components/charts/AreaChart', () => ({ AreaChart: () => null }));
jest.mock('@/src/components/charts/BarChart', () => ({ BarChart: () => null }));
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

const vm = {
  wealthAreaSeries: [[], []],
  barChartData: [],
  dailyData: [],
  targetCurrency: 'EUR',
  onViewTransactions: jest.fn(),
} as ReportWealthTabVm;

describe('legacy wealth chart explanations', () => {
  it('explains net worth history and momentum separately from numeric tooltips', () => {
    render(
      <ReportWealthSection
        vm={vm}
        chartWidth={320}
        explanationScope={{
          periodLabel: 'Last 30 days',
          accountScopeLabel: 'All accounts',
        }}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Explain Net worth history' }));
    expect(
      screen.getByText(
        'Each point reconstructs available assets and liabilities through the selected period using opening balances and dated account changes.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Last 30 days')).toBeTruthy();
    expect(screen.getByText('All accounts')).toBeTruthy();
    expect(screen.getByText('EUR')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close Net worth history explanation' }));

    fireEvent.press(screen.getByRole('button', { name: 'Explain Daily momentum' }));
    expect(
      screen.getByText(
        'Each bar compares assets and liabilities for one report period bucket inside the selected range.',
      ),
    ).toBeTruthy();
  });
});
