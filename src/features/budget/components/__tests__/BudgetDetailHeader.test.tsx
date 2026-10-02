import { BudgetDetailHeader } from '../BudgetDetailHeader';
import { BudgetSetupDisclosure } from '../BudgetSetupDisclosure';
import { render, fireEvent, cleanup } from '@/src/utils/test-utils';
import { BudgetId, AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';

jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toAccountDetails: jest.fn() } }));

const props = {
  budget: { id: 'food' as BudgetId, name: 'Food', amount: 500.75, currencyCode: 'USD' },
  usage: { spent: 126.55, remaining: 374.2, budgetAmount: 500.75, usagePercent: 0.25 },
  periodLabel: 'October 2026',
  isCurrentMonth: true,
  periodRange: {
    startDate: new Date(2026, 9, 1).getTime(),
    endDate: new Date(2026, 9, 31, 23, 59).getTime(),
  },
  chartData: null,
  prevMonth: jest.fn(),
  nextMonth: jest.fn(),
  resetToToday: jest.fn(),
};

const setupProps = {
  budget: props.budget,
  periodRange: props.periodRange,
  scopeAccounts: [
    {
      id: 'dining' as AccountId,
      name: 'Dining out',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    },
  ],
  fundingAccounts: [],
  isLoadingScope: false,
  isLoadingFunding: false,
  onEdit: jest.fn(),
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

  it('shows exact totals for the selected period', () => {
    const screen = render(<BudgetDetailHeader {...props} />);
    expect(screen.getByText('$374.20')).toBeTruthy();
    expect(screen.getByText('$126.55')).toBeTruthy();
    expect(screen.getByText('$500.75')).toBeTruthy();
    expect(screen.getByText('1 Oct 2026 – 31 Oct 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled();
  });

  it('links the scope responsible for the totals', () => {
    const screen = render(<BudgetSetupDisclosure {...setupProps} />);
    fireEvent.press(screen.getByRole('button', { name: 'Expand Budget setup' }));
    fireEvent.press(screen.getByRole('button', { name: 'Dining out' }));
    expect(AppNavigation.toAccountDetails).toHaveBeenCalledWith('dining', props.periodRange);
  });

  it('explains a missing scope and retains the edit action', () => {
    const screen = render(<BudgetSetupDisclosure {...setupProps} scopeAccounts={[]} />);
    fireEvent.press(screen.getByRole('button', { name: 'Expand Budget setup' }));
    expect(screen.getByText(/No categories selected/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Edit budget setup' }));
    expect(setupProps.onEdit).toHaveBeenCalledTimes(1);
  });

  it('masks totals in privacy mode', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(<BudgetDetailHeader {...props} />);
    expect(screen.getAllByText(AppConfig.privacyMask).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('$374.20')).toBeNull();
    expect(screen.queryByText('$126.55')).toBeNull();
    expect(screen.queryByText('$500.75')).toBeNull();
  });
});
