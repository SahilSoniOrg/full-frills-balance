import { AccountsListModals } from '../AccountsListModals';
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
  showMonthlyStats: false,
  monthlyIncome: 0,
  monthlyExpenses: 0,
};

describe('AccountsListModals', () => {
  const defaultProps = {
    onCloseModal: jest.fn(),
    selectedAccountsList: [mockAccount],
    selectedCount: 1,
    bulkParentCandidates: [],
    onBulkRenameSave: jest.fn(),
    onBulkHierarchyMoveAssign: jest.fn(),
    onBulkAppearanceSelect: jest.fn(),
    onViewDetails: jest.fn(),
    onEditAccount: jest.fn(),
    onRecolorAccount: jest.fn(),
    onReconcileAccount: jest.fn(),
    onToggleArchiveAccount: jest.fn(),
    onDeleteAccount: jest.fn(),
    onAppearanceUpdate: jest.fn(),
  };

  it('renders nothing when activeModal is null', () => {
    const { queryByText } = render(<AccountsListModals activeModal={null} {...defaultProps} />);
    expect(queryByText('View Details')).toBeNull();
    expect(queryByText('Edit Account Names')).toBeNull();
    expect(queryByText('Move Accounts')).toBeNull();
  });

  it('renders AccountActionSheet when activeModal is actionSheet', () => {
    const { getByText } = render(
      <AccountsListModals
        activeModal={{ type: 'actionSheet', account: mockAccount }}
        {...defaultProps}
      />,
    );
    expect(getByText('View Details')).toBeTruthy();
    expect(getByText('Edit Account')).toBeTruthy();
  });

  it('renders AppearancePickerModal when activeModal is appearance', () => {
    const onAppearanceUpdate = jest.fn();
    const { getByText } = render(
      <AccountsListModals
        activeModal={{ type: 'appearance', account: mockAccount }}
        {...defaultProps}
        onAppearanceUpdate={onAppearanceUpdate}
      />,
    );
    expect(getByText('Account appearance')).toBeTruthy();
    fireEvent.press(getByText('Done'));
    expect(onAppearanceUpdate).toHaveBeenCalledWith({
      icon: 'wallet',
      color: '#EEF2FF',
    });
  });

  it('renders AppearancePickerModal for bulk color update', () => {
    const onBulkAppearanceSelect = jest.fn();
    const { getByText } = render(
      <AccountsListModals
        activeModal={{ type: 'bulkAppearance', mode: 'color' }}
        {...defaultProps}
        onBulkAppearanceSelect={onBulkAppearanceSelect}
      />,
    );
    expect(getByText('Change Color for Selected Accounts')).toBeTruthy();
  });

  it('renders BulkRenameAccountsModal when activeModal is bulkRename', () => {
    const { getByText, getByDisplayValue } = render(
      <AccountsListModals activeModal={{ type: 'bulkRename' }} {...defaultProps} />,
    );
    expect(getByText('Edit Account Names')).toBeTruthy();
    expect(getByDisplayValue('Checking Account')).toBeTruthy();
  });

  it('renders BulkHierarchyMoveModal when activeModal is bulkHierarchy', () => {
    const { getByText } = render(
      <AccountsListModals activeModal={{ type: 'bulkHierarchy' }} {...defaultProps} />,
    );
    expect(getByText('Move Accounts')).toBeTruthy();
    expect(getByText('None (Root Level)')).toBeTruthy();
  });
});
