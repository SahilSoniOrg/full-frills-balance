import { ReportOverviewSection } from '@/src/features/reports/components/sections/ReportOverviewSection';
import type { ReportOverviewTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { Text as MockText } from 'react-native';

jest.mock('@/src/features/reports/components/ReportSummaryCard', () => ({
  ReportSummaryCard: () => <MockText>Summary</MockText>,
}));
jest.mock('@/src/features/reports/components/widgets/NetWorthTrendWidget', () => ({
  NetWorthTrendWidget: () => <MockText>Net worth trend</MockText>,
}));
jest.mock('@/src/features/reports/components/widgets/IncomeExpenseBalanceWidget', () => ({
  IncomeExpenseBalanceWidget: () => <MockText>Income and expense</MockText>,
}));
jest.mock('@/src/features/reports/components/widgets/MoneyFlowWidget', () => ({
  MoneyFlowWidget: () => <MockText>Money flow</MockText>,
}));

describe('ReportOverviewSection', () => {
  it('keeps secondary charts behind an accessible disclosure', () => {
    render(<ReportOverviewSection vm={{} as ReportOverviewTabVm} chartWidth={320} />);

    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.getByText('Net worth trend')).toBeTruthy();
    expect(screen.queryByText('Income and expense')).toBeNull();
    expect(screen.queryByText('Money flow')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Expand Income, expense & money flow',
        expanded: false,
      }),
    ).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByRole('button', { name: 'Expand Income, expense & money flow' }));
    });

    expect(
      screen.getByRole('button', {
        name: 'Collapse Income, expense & money flow',
        expanded: true,
      }),
    ).toBeTruthy();
    expect(screen.getByText('Income and expense')).toBeTruthy();
    expect(screen.getByText('Money flow')).toBeTruthy();
  });
});
