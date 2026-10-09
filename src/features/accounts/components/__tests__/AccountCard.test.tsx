import { Icon } from '@/src/types/domainIcons';
import { AccountCard } from '../AccountCard';
import { AccountCardViewModel } from '../../utils/transformAccounts';
import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { fireEvent, render } from '@/src/utils/test-utils';
import { AppConfig, Opacity, Shape, Spacing, Typography } from '@/src/constants';
import { preferences } from '@/src/services/preferences';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { getThemeColors, ThemeIds } from '@/src/constants/design-tokens';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { withOpacity } from '@/src/utils/color-math';

import { getLayoutPath as layoutPath } from '@/src/testing/layoutAssertions';

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

type CardProps = ComponentProps<typeof AccountCard>;

function renderCard({
  account = mockAccount,
  onPress = jest.fn(),
  ...rest
}: Partial<CardProps> & { account?: AccountCardViewModel } = {}) {
  return render(
    <AccountCard
      account={account}
      onPress={onPress}
      dividerColor="divider"
      surfaceColor="surface"
      {...rest}
    />,
  );
}

describe('AccountCard', () => {
  beforeEach(() => preferences.privacy.setIsPrivacyMode(false));
  afterEach(() => preferences.privacy.setIsPrivacyMode(false));

  it('renders account title and formatted balance', () => {
    expect(renderCard().getByText('Checking Account')).toBeTruthy();
  });

  it('shows the reconciliation badge and removes it when reconciliation is cleared', () => {
    const reconciledAt = new Date(2026, 8, 30, 13, 48);
    const screen = renderCard({ account: { ...mockAccount, reconciledAt } });
    expect(screen.getByTestId('account-card-reconciled-badge')).toBeTruthy();
    const date = screen.getByText(formatRelativeReconciledDate(reconciledAt));
    expect(date).toHaveStyle({
      opacity: Opacity.heavy,
      color: mockAccount.textColor,
      fontSize: Typography.sizes.xs,
      lineHeight: 12,
    });
    expect(screen.getByTestId('account-card-reconciled-badge')).toHaveStyle({
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: Shape.radius.sm,
    });
    expect(screen.getByTestId('account-card-header-actions').findAllByType(date.type)).toContain(
      date,
    );
    screen.rerender(
      <AccountCard
        account={mockAccount}
        onPress={jest.fn()}
        dividerColor="divider"
        surfaceColor="surface"
      />,
    );
    expect(screen.queryByTestId('account-card-reconciled-badge')).toBeNull();
  });

  it.each([false, true])(
    'keeps the reconciliation date in selection mode (selected: %s)',
    isSelected => {
      const reconciledAt = new Date(2026, 8, 30, 13, 48);
      const screen = renderCard({
        account: { ...mockAccount, reconciledAt },
        isSelectionModeActive: true,
        isSelected,
      });
      expect(screen.getByTestId('account-card-reconciled-badge')).toBeTruthy();
      expect(screen.getByText(formatRelativeReconciledDate(reconciledAt))).toBeTruthy();
    },
  );

  it.each(['light', 'dark'] as const)(
    'retains the original translucent background in %s mode',
    mode => {
      const screen = render(
        <ThemeOverride mode={mode} themeId={ThemeIds.DEEP_SPACE}>
          <AccountCard
            account={{ ...mockAccount, reconciledAt: new Date(2026, 8, 30) }}
            onPress={jest.fn()}
            dividerColor="divider"
            surfaceColor="surface"
          />
        </ThemeOverride>,
      );
      expect(screen.getByTestId('account-card-reconciled-badge')).toHaveStyle({
        backgroundColor: withOpacity(
          getThemeColors(ThemeIds.DEEP_SPACE, mode).pureInverse,
          Opacity.soft,
        ),
        borderRadius: Shape.radius.sm,
      });
    },
  );

  it('calls onPress when tapped', () => {
    const onPressMock = jest.fn();
    fireEvent.press(renderCard({ onPress: onPressMock }).getByText('Checking Account'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('calls onLongPress when long-pressed', () => {
    const onLongPressMock = jest.fn();
    fireEvent(
      renderCard({ onLongPress: onLongPressMock }).getByText('Checking Account'),
      'longPress',
    );
    expect(onLongPressMock).toHaveBeenCalledTimes(1);
  });

  it('calls onActionPress from the overflow button', () => {
    const onActionPressMock = jest.fn();
    fireEvent.press(
      renderCard({ onActionPress: onActionPressMock }).getByLabelText(
        'Actions for Checking Account',
      ),
    );
    expect(onActionPressMock).toHaveBeenCalledTimes(1);
  });

  it('places the overflow action on the amount row, with stable space on both sides', () => {
    const screen = renderCard({ onActionPress: jest.fn() });
    const action = screen.getByLabelText('Actions for Checking Account');
    const row = screen.getByTestId('account-card-amount-row');
    expect(row).toHaveStyle({ flexDirection: 'row', alignItems: 'center' });
    expect(row.findAllByType(action.type)).toContain(action);
    expect(row.findAllByType(screen.getByText('$1,500.00').type)).toContain(
      screen.getByText('$1,500.00'),
    );
    expect(
      screen.getByTestId('account-card-amount-action-spacer', { includeHiddenElements: true }),
    ).toHaveStyle({
      width: 44,
      height: 44,
    });
    expect(
      screen.getByTestId('account-card-header-actions').findAllByType(action.type),
    ).not.toContain(action);
  });

  it('exposes the account name, hierarchy level, balance, and reconciliation date to accessibility', () => {
    const reconciledAt = new Date(2026, 8, 30, 13, 48);
    const card = renderCard({ account: { ...mockAccount, depth: 2, reconciledAt } }).getByRole(
      'button',
      { name: /Checking Account/ },
    );
    expect(card.props.accessibilityLabel).toContain('level 3');
    expect(card.props.accessibilityLabel).toContain('balance $1,500.00');
    expect(card.props.accessibilityLabel).toContain(
      `Reconciled ${formatRelativeReconciledDate(reconciledAt)}`,
    );
  });

  it('masks the accessible balance when privacy mode is enabled', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = renderCard();
    const card = screen.getByRole('button', { name: /Checking Account/ });
    expect(card.props.accessibilityLabel).toContain(`balance ${AppConfig.privacyMask}`);
    expect(card.props.accessibilityLabel).not.toContain('1,500');
    expect(screen.getAllByText(AppConfig.privacyMask).length).toBeGreaterThan(0);
  });

  it('includes the converted foreign balance and currency in its accessible label', () => {
    const screen = renderCard({
      account: {
        ...mockAccount,
        workplaceBalance: 1234.56,
        workplaceCurrencyCode: 'EUR',
      },
    });
    expect(screen.getByText(/≈/)).toBeTruthy();
    const label = screen.getByRole('button', { name: /Checking Account/ }).props.accessibilityLabel;
    expect(label).toContain('approximately €1,234.56');
    expect(label).toContain('€');
  });

  it.each([false, true] as const)('renders selection indicator when isSelected=%s', isSelected => {
    expect(
      renderCard({ isSelectionModeActive: true, isSelected }).getByTestId(
        'account-card-selection-indicator',
      ),
    ).toBeTruthy();
  });

  it('exposes archived and selected state to assistive technology', () => {
    const screen = renderCard({
      account: { ...mockAccount, isArchived: true },
      isSelectionModeActive: true,
      isSelected: true,
    });
    expect(
      screen.getByRole('button', { name: /Checking Account.*Archived/ }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByTestId('account-card-selection-indicator').props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('omits monthly stats when showMonthlyStats is false', () => {
    const screen = renderCard({ account: { ...mockAccount, showMonthlyStats: false } });
    expect(screen.queryByText('MONEY IN')).toBeNull();
    expect(screen.queryByText('MONEY OUT')).toBeNull();
  });

  it('calls onCollapse from the hierarchy action', () => {
    const onCollapse = jest.fn();
    fireEvent.press(
      renderCard({ account: { ...mockAccount, hasChildren: true }, onCollapse }).getByLabelText(
        'Expand sub-accounts for Checking Account',
      ),
    );
    expect(onCollapse).toHaveBeenCalledWith(mockAccount.id);
  });

  it.each([false, true])(
    'retains the parent toggle with expanded=%s and calls the hierarchy handler',
    isExpanded => {
      const onCollapse = jest.fn();
      const screen = renderCard({
        account: { ...mockAccount, hasChildren: true, isExpanded },
        onCollapse,
      });
      const toggle = screen.getByLabelText(
        `${isExpanded ? 'Collapse' : 'Expand'} sub-accounts for Checking Account`,
      );
      expect(toggle.props.accessibilityState).toMatchObject({ expanded: isExpanded });
      fireEvent.press(toggle);
      expect(onCollapse).toHaveBeenCalledWith(mockAccount.id);
    },
  );

  it('does not show the hierarchy toggle for a leaf account', () => {
    const screen = renderCard();
    expect(screen.queryByLabelText(/sub-accounts for Checking Account/)).toBeNull();
  });

  it('keeps hierarchy expansion available in selection mode and hides overflow actions', () => {
    const onCollapse = jest.fn();
    const onActionPress = jest.fn();
    const screen = renderCard({
      account: { ...mockAccount, hasChildren: true, isExpanded: true },
      onCollapse,
      onActionPress,
      isSelectionModeActive: true,
    });
    const hierarchyAction = screen.getByLabelText('Collapse sub-accounts for Checking Account');
    expect(hierarchyAction.props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.queryByLabelText('Actions for Checking Account')).toBeNull();
    fireEvent.press(hierarchyAction);
    expect(onCollapse).toHaveBeenCalledWith(mockAccount.id);
    expect(onActionPress).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps card geometry stable during selection (hierarchy: %s)',
    hasChildren => {
      const account = { ...mockAccount, hasChildren, reconciledAt: new Date(2026, 8, 30, 13, 48) };
      const props = {
        account,
        onPress: jest.fn(),
        onActionPress: jest.fn(),
        dividerColor: 'divider' as const,
        surfaceColor: 'surface' as const,
      };
      const screen = render(<AccountCard {...props} />);
      const originalTitleLayout = layoutPath(screen.getByText(account.name));
      const originalBalanceLayout = layoutPath(screen.getByText('$1,500.00'));
      const actionFootprints = () =>
        screen
          .getByTestId('account-card-header-actions')
          .children.map(child =>
            typeof child === 'string' ? child : StyleSheet.flatten(child.props.style),
          );
      const originalActions = actionFootprints();

      for (const isSelected of [false, true, false]) {
        screen.rerender(<AccountCard {...props} isSelectionModeActive isSelected={isSelected} />);
        expect(layoutPath(screen.getByText(account.name))).toEqual(originalTitleLayout);
        expect(layoutPath(screen.getByText('$1,500.00'))).toEqual(originalBalanceLayout);
        expect(actionFootprints()).toEqual(originalActions);
        const outline = screen.queryByTestId('account-card-selection-outline', {
          includeHiddenElements: true,
        });
        if (isSelected) {
          expect(outline).toHaveStyle({
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          });
        } else {
          expect(outline).toBeNull();
        }
      }
      screen.rerender(<AccountCard {...props} />);
      expect(layoutPath(screen.getByText(account.name))).toEqual(originalTitleLayout);
      expect(layoutPath(screen.getByText('$1,500.00'))).toEqual(originalBalanceLayout);
      expect(actionFootprints()).toEqual(originalActions);
    },
  );

  it('renders MONEY IN and MONEY OUT for an asset account', () => {
    const screen = renderCard();
    expect(screen.getByText('MONEY IN')).toBeTruthy();
    expect(screen.getByText('MONEY OUT')).toBeTruthy();
  });

  it('renders MONTH SPENT and REFUNDS / CREDITS for an expense account', () => {
    const screen = renderCard({
      account: {
        ...mockAccount,
        name: 'Food & Drink',
        accountType: AccountType.EXPENSE,
        monthlyIncome: 1341,
        monthlyExpenses: 0,
      },
    });
    expect(screen.getByText('MONTH SPENT')).toBeTruthy();
    expect(screen.getByText('REFUNDS / CREDITS')).toBeTruthy();
  });

  it.each([
    [AccountType.INCOME, 'MONTH EARNED', 'ADJUSTMENTS'],
    [AccountType.LIABILITY, 'PAYMENTS MADE', 'NEW CHARGES'],
    [AccountType.EQUITY, 'ADDITIONS', 'REDUCTIONS'],
  ] as const)('renders %s card labels', (accountType, leftLabel, rightLabel) => {
    const screen = renderCard({ account: { ...mockAccount, name: accountType, accountType } });
    expect(screen.getByText(leftLabel)).toBeTruthy();
    expect(screen.getByText(rightLabel)).toBeTruthy();
  });
});
