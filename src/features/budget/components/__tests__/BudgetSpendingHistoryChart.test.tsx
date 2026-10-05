import { BudgetSpendingHistoryChart } from '../BudgetSpendingHistoryChart';
import { cleanup, render } from '@/src/utils/test-utils';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';
import type { BudgetSpendingPeriod } from '../../hooks/budgetEditDraft';

const periods: BudgetSpendingPeriod[] = [
  { label: 'May', startDate: 1, endDate: 2, spent: 40 },
  { label: 'Jun', startDate: 3, endDate: 4, spent: 140 },
  { label: 'Current', startDate: 5, endDate: 6, spent: 20 },
];

describe('BudgetSpendingHistoryChart', () => {
  afterEach(() => {
    cleanup();
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('moves the dashed limit and flips over-limit color when the entered amount changes', () => {
    const screen = render(
      <BudgetSpendingHistoryChart periods={periods} limit={100} average={90} currencyCode="USD" />,
    );
    expect(screen.getByTestId('budget-history-bar-0')).toBeTruthy();
    expect(screen.getByTestId('budget-history-bar-1')).toBeTruthy();
    expect(screen.getByTestId('budget-history-bar-2')).toBeTruthy();
    const initialLimitY = screen.getByTestId('budget-history-limit-line').props.style.top;
    const overLimitColor = screen.getByTestId('budget-history-bar-fill-1').props.style
      .backgroundColor;
    expect(initialLimitY).toBeGreaterThan(0);
    expect(screen.getByText('Dashed line: $100.00 limit')).toBeTruthy();

    screen.rerender(
      <BudgetSpendingHistoryChart periods={periods} limit={150} average={90} currencyCode="USD" />,
    );

    expect(screen.getByTestId('budget-history-limit-line').props.style.top).not.toBe(initialLimitY);
    expect(screen.getByTestId('budget-history-bar-fill-1').props.style.backgroundColor).not.toBe(
      overLimitColor,
    );
  });

  it('masks history values and the accessible summary in privacy mode', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(
      <BudgetSpendingHistoryChart periods={periods} limit={100} average={90} currencyCode="USD" />,
    );
    expect(screen.getAllByText(new RegExp(AppConfig.privacyMask)).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByTestId('budget-spending-history-chart').props.accessibilityLabel,
    ).not.toContain('$100.00');
  });
});
