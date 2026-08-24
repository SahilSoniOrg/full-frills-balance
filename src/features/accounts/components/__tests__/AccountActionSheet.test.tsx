import { AccountActionSheet } from '../AccountActionSheet';
import { AccountCardViewModel } from '../../utils/transformAccounts';
import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
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

describe('AccountActionSheet', () => {
  it('renders actions for active account', () => {
    const { getByText, getAllByText } = render(
      <AccountActionSheet
        visible={true}
        account={mockAccount}
        onClose={jest.fn()}
        onViewDetails={jest.fn()}
        onEdit={jest.fn()}
        onRecolor={jest.fn()}
        onReconcile={jest.fn()}
        onToggleArchive={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(getAllByText('Checking Account').length).toBeGreaterThanOrEqual(1);
    expect(getByText('View Details')).toBeTruthy();
    expect(getByText('Edit Account')).toBeTruthy();
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Reconcile')).toBeTruthy();
    expect(getByText('Archive Account')).toBeTruthy();
    expect(getByText('Delete Account')).toBeTruthy();
  });

  it('renders Unarchive label when account is archived', () => {
    const archivedAccount = { ...mockAccount, isArchived: true };
    const { getByText } = render(
      <AccountActionSheet
        visible={true}
        account={archivedAccount}
        onClose={jest.fn()}
        onViewDetails={jest.fn()}
        onEdit={jest.fn()}
        onRecolor={jest.fn()}
        onReconcile={jest.fn()}
        onToggleArchive={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(getByText('Unarchive Account')).toBeTruthy();
  });

  it('triggers action callbacks when options are pressed', () => {
    const onEdit = jest.fn();
    const onRecolor = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <AccountActionSheet
        visible={true}
        account={mockAccount}
        onClose={onClose}
        onViewDetails={jest.fn()}
        onEdit={onEdit}
        onRecolor={onRecolor}
        onReconcile={jest.fn()}
        onToggleArchive={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    fireEvent.press(getByText('Edit Account'));
    expect(onEdit).toHaveBeenCalledWith(mockAccount);
    expect(onClose).toHaveBeenCalled();
  });
});
