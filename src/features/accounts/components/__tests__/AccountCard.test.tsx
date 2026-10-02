import { Icon } from '@/src/types/domainIcons';
import { AccountCard } from '../AccountCard';
import { AccountCardViewModel } from '../../utils/transformAccounts';
import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { fireEvent, render } from '@/src/utils/test-utils';
import { AppConfig } from '@/src/constants';
import { preferences } from '@/src/services/preferences';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';

const mockAccount: AccountCardViewModel = {
  id: 'acc-1' as AccountId,
  name: 'Checking Account',
  accountType: AccountType.ASSET,
  balance: 1500,
  currencyCode: 'USD',
  depth: 0,
  icon: Icon.Wallet,
  categoryColor: '#4F46E5',
  accountColor: '#EEF2FF',
  textColor: '#1E1B4B',
  hasChildren: false,
  isExpanded: false,
  isArchived: false,
  showMonthlyStats: true,
  monthlyIncome: 500,
  monthlyExpenses: 200,
};

describe('AccountCard', () => {
  beforeEach(() => preferences.privacy.setIsPrivacyMode(false));
  afterEach(() => preferences.privacy.setIsPrivacyMode(false));

  it('renders account title and formatted balance', () => {
    const { getByText } = render(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    expect(getByText('Checking Account')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPressMock = jest.fn();
    const { getByText } = render(
      <AccountCard
        account={mockAccount}
        onPress={onPressMock}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    fireEvent.press(getByText('Checking Account'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('calls onLongPress when long-pressed', () => {
    const onLongPressMock = jest.fn();
    const { getByText } = render(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        onLongPress={onLongPressMock}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    fireEvent(getByText('Checking Account'), 'longPress');
    expect(onLongPressMock).toHaveBeenCalledTimes(1);
  });

  it('calls onActionPress from the overflow button', () => {
    const onActionPressMock = jest.fn();
    const { getByLabelText } = render(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        onActionPress={onActionPressMock}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    fireEvent.press(getByLabelText('Actions for Checking Account'));
    expect(onActionPressMock).toHaveBeenCalledTimes(1);
  });

  it('exposes the account name, hierarchy level, balance, and reconciliation date to accessibility', () => {
    const reconciledAt = new Date(2026, 8, 30, 13, 48);
    const { getByRole } = render(
      <AccountCard
        account={{ ...mockAccount, depth: 2, reconciledAt }}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    const card = getByRole('button', { name: /Checking Account/ });
    expect(card.props.accessibilityLabel).toContain('level 3');
    expect(card.props.accessibilityLabel).toContain('balance $1,500.00');
    expect(card.props.accessibilityLabel).toContain(
      `Reconciled ${formatRelativeReconciledDate(reconciledAt)}`,
    );
  });

  it('masks the accessible balance when privacy mode is enabled', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const { getByRole, getAllByText } = render(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    const card = getByRole('button', { name: /Checking Account/ });
    expect(card.props.accessibilityLabel).toContain(`balance ${AppConfig.privacyMask}`);
    expect(card.props.accessibilityLabel).not.toContain('1,500');
    expect(getAllByText(AppConfig.privacyMask).length).toBeGreaterThan(0);
  });

  it('includes the converted foreign balance and currency in its accessible label', () => {
    const account = {
      ...mockAccount,
      workplaceBalance: 1234.56,
      workplaceCurrencyCode: 'EUR',
    };
    const { getByRole, getByText } = render(
      <AccountCard
        account={account}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    expect(getByText(/≈/)).toBeTruthy();
    const label = getByRole('button', { name: /Checking Account/ }).props.accessibilityLabel;
    expect(label).toContain('approximately €1,234.56');
    expect(label).toContain('€');
  });

  it('renders selection indicator when isSelectionModeActive is true', () => {
    const { getByTestId } = render(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
        isSelectionModeActive={true}
        isSelected={false}
      />,
    );

    expect(getByTestId('account-card-selection-indicator')).toBeTruthy();
  });

  it('renders checked selection indicator when isSelected is true', () => {
    const { getByTestId } = render(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
        isSelectionModeActive={true}
        isSelected={true}
      />,
    );

    expect(getByTestId('account-card-selection-indicator')).toBeTruthy();
  });

  it('exposes archived and selected state to assistive technology', () => {
    const { getByRole, getByTestId } = render(
      <AccountCard
        account={{ ...mockAccount, isArchived: true }}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
        isSelectionModeActive={true}
        isSelected={true}
      />,
    );

    expect(getByRole('button', { name: /Checking Account.*Archived/ }).props.accessibilityState)
      .toMatchObject({ selected: true });
    expect(getByTestId('account-card-selection-indicator').props.accessibilityState)
      .toMatchObject({ checked: true });
  });

  it('omits monthly stats when showMonthlyStats is false', () => {
    const { queryByText } = render(
      <AccountCard
        account={{ ...mockAccount, showMonthlyStats: false }}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    expect(queryByText('MONEY IN')).toBeNull();
    expect(queryByText('MONEY OUT')).toBeNull();
  });

  it('calls onCollapse from the hierarchy action', () => {
    const onCollapse = jest.fn();
    const { getByLabelText } = render(
      <AccountCard
        account={{ ...mockAccount, hasChildren: true }}
        onPress={jest.fn()}
        onCollapse={onCollapse}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    fireEvent.press(getByLabelText('Expand sub-accounts for Checking Account'));
    expect(onCollapse).toHaveBeenCalledWith(mockAccount.id);
  });

  it('keeps hierarchy expansion available in selection mode and hides overflow actions', () => {
    const onCollapse = jest.fn();
    const onActionPress = jest.fn();
    const { getByLabelText, queryByLabelText } = render(
      <AccountCard
        account={{ ...mockAccount, hasChildren: true, isExpanded: true }}
        onPress={jest.fn()}
        onCollapse={onCollapse}
        onActionPress={onActionPress}
        dividerColor="divider"
        surfaceColor="surface"
        isSelectionModeActive={true}
      />,
    );

    const hierarchyAction = getByLabelText('Collapse sub-accounts for Checking Account');
    expect(hierarchyAction.props.accessibilityState).toMatchObject({ expanded: true });
    expect(queryByLabelText('Actions for Checking Account')).toBeNull();

    fireEvent.press(hierarchyAction);
    expect(onCollapse).toHaveBeenCalledWith(mockAccount.id);
    expect(onActionPress).not.toHaveBeenCalled();
  });

  it('renders MONEY IN and MONEY OUT for an asset account', () => {
    const { getByText } = render(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    expect(getByText('MONEY IN')).toBeTruthy();
    expect(getByText('MONEY OUT')).toBeTruthy();
  });

  it('renders MONTH SPENT and REFUNDS / CREDITS for an expense account', () => {
    const expenseAccount: AccountCardViewModel = {
      ...mockAccount,
      name: 'Food & Drink',
      accountType: AccountType.EXPENSE,
      monthlyIncome: 1341,
      monthlyExpenses: 0,
    };
    const { getByText } = render(
      <AccountCard
        account={expenseAccount}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    expect(getByText('MONTH SPENT')).toBeTruthy();
    expect(getByText('REFUNDS / CREDITS')).toBeTruthy();
  });

  it.each([
    [AccountType.INCOME, 'MONTH EARNED', 'ADJUSTMENTS'],
    [AccountType.LIABILITY, 'PAYMENTS MADE', 'NEW CHARGES'],
    [AccountType.EQUITY, 'ADDITIONS', 'REDUCTIONS'],
  ] as const)('renders %s card labels', (accountType, leftLabel, rightLabel) => {
    const { getByText } = render(
      <AccountCard
        account={{ ...mockAccount, name: accountType, accountType }}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );

    expect(getByText(leftLabel)).toBeTruthy();
    expect(getByText(rightLabel)).toBeTruthy();
  });
});
