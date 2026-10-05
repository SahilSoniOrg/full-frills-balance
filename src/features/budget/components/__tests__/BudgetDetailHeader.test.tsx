import { BudgetDetailHeader } from '../BudgetDetailHeader';
import { render, cleanup } from '@/src/utils/test-utils';
import { BudgetId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';
import { MoneyText } from '@/src/components/shared/MoneyText';

const props = {
  budget: { id: 'food' as BudgetId, name: 'Food', amount: 500.75, currencyCode: 'USD' },
  usage: { spent: 126.55, remaining: 374.2, budgetAmount: 500.75, usagePercent: 0.25 },
  periodLabel: 'October 2026',
  isCurrentPeriod: true,
  periodRange: {
    startDate: new Date(2026, 9, 1).getTime(),
    endDate: new Date(2026, 9, 31, 23, 59).getTime(),
  },
  previousComparisonSpent: null,
  prevMonth: jest.fn(),
  nextMonth: jest.fn(),
  resetToToday: jest.fn(),
};

describe('BudgetDetailHeader', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
    jest.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('shows exact totals for the selected period and disables forward navigation', () => {
    const screen = render(<BudgetDetailHeader {...props} />);
    expect(screen.getByText('$374.20')).toBeTruthy();
    expect(
      screen.UNSAFE_getAllByType(MoneyText).find(node => node.props.amount === 374.2)?.props
        .variant,
    ).toBe('title');
    expect(screen.getByText('$126.55')).toBeTruthy();
    expect(screen.getByText('$500.75')).toBeTruthy();
    expect(screen.getByLabelText(/1 Oct 2026 – 31 Oct 2026/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled();
  });

  it('does not suggest a daily allowance after the budget is over limit', () => {
    const screen = render(
      <BudgetDetailHeader
        {...props}
        usage={{ ...props.usage, spent: 600, remaining: -99.25, usagePercent: 1.198 }}
      />,
    );
    expect(screen.getByText('Per day left')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText(/\$[\d,]+\.\d{2}\/day/)).toBeNull();
  });

  it('masks every money amount in privacy mode', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(<BudgetDetailHeader {...props} />);
    expect(screen.getAllByText(AppConfig.privacyMask).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('$374.20')).toBeNull();
    expect(screen.queryByText('$126.55')).toBeNull();
    expect(screen.queryByText('$500.75')).toBeNull();
  });

  it('shows incomplete FX ahead of the estimated overspend status', () => {
    const screen = render(
      <BudgetDetailHeader
        {...props}
        usage={{
          ...props.usage,
          spent: 600,
          remaining: -99.25,
          usagePercent: 1.198,
          hasUnvaluedEntries: true,
          unvaluedEntryCount: 2,
          unvaluedCurrencyCounts: [{ currencyCode: 'EUR', count: 2 }],
        }}
      />,
    );
    expect(screen.getByText('Incomplete')).toBeTruthy();
    expect(screen.queryByText('By 20%')).toBeNull();
    expect(screen.getByText('2 EUR entries without a rate · tap to fix')).toBeTruthy();
    expect(screen.getByText('Days')).toBeTruthy();
    expect(screen.queryByText('Per day left')).toBeNull();
  });

  it('keeps an empty budget quiet about pace', () => {
    const screen = render(
      <BudgetDetailHeader
        {...props}
        usage={{ ...props.usage, spent: 0, remaining: 500.75, usagePercent: 0 }}
      />,
    );
    expect(screen.getByText('Nothing spent yet')).toBeTruthy();
    expect(screen.queryByText('On pace')).toBeNull();
  });
});
