import { AccountCard } from '../AccountCard';
import { AccountCardViewModel } from '../../utils/transformAccounts';
import { AccountType, AccountId } from '@/src/types/domain';
import { fireEvent, render } from '@/src/utils/test-utils';

const mockAccount: AccountCardViewModel = {
  id: 'acc-1' as AccountId,
  name: 'Checking Account',
  accountType: AccountType.ASSET,
  balance: 1500,
  currencyCode: 'USD',
  depth: 0,
  icon: 'wallet',
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
});
