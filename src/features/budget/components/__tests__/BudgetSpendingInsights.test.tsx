import { BudgetSpendingInsights } from '../BudgetSpendingInsights';
import { cleanup, fireEvent, render } from '@/src/utils/test-utils';
import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';

const account = {
  id: 'dining' as AccountId,
  name: 'Dining',
  accountType: AccountType.EXPENSE,
  currencyCode: 'USD',
};
const props = {
  chartData: {
    data: [],
    domainX: [1, 2] as [number, number],
    hasUnvaluedEntries: false,
    entryCount: 2,
    refunds: 12.5,
    categories: [
      {
        accountId: account.id,
        spent: 67.75,
        refunds: 12.5,
        entryCount: 2,
        hasUnvaluedEntries: false,
      },
    ],
  },
  isLoading: false,
  currencyCode: 'USD',
  expenseAccounts: [account],
  previousUsage: { spent: 85.95, remaining: 14.05, budgetAmount: 100, usagePercent: 0.8595 },
  previousPeriodRange: {
    startDate: new Date(2026, 8, 1).getTime(),
    endDate: new Date(2026, 8, 30).getTime(),
  },
  onPreviousPeriod: jest.fn(),
  onFilterCategory: jest.fn(),
  activityCategory: null,
};

describe('budget spending insights', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
    jest.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('provides category filtering, refunds, and explicitly labels the previous full-period total', () => {
    const screen = render(<BudgetSpendingInsights {...props} activityCategory={account} />);
    fireEvent.press(screen.getByRole('button', { name: 'Expand Where it went' }));
    expect(screen.getByText('$67.75')).toBeTruthy();
    expect(screen.getByText('$12.50')).toBeTruthy();
    expect(screen.getByText('$85.95')).toBeTruthy();
    expect(screen.getByText('spent over the full period')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Show Dining activity' }));
    expect(props.onFilterCategory).toHaveBeenCalledWith(account.id);
    fireEvent.press(screen.getByText('View period'));
    expect(props.onPreviousPeriod).toHaveBeenCalledTimes(1);
  });

  it('masks every new amount and exposes partial valuation and loading errors', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(
      <BudgetSpendingInsights
        {...props}
        chartData={{ ...props.chartData, hasUnvaluedEntries: true }}
        error="Breakdown unavailable"
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Expand Where it went' }));
    expect(screen.getAllByText(AppConfig.privacyMask)).toHaveLength(3);
    expect(screen.getByText(/Category amounts are partial/)).toBeTruthy();
    expect(screen.getByText('Retry breakdown')).toBeTruthy();
  });
});
