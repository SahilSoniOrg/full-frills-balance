import { Icon } from '@/src/types/domainIcons';
import { AccountsListView } from '../AccountsListView';
import { AccountSectionViewModel, AccountCardViewModel } from '../../utils/transformAccounts';
import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { fireEvent, render } from '@/src/testing/render';

jest.mock('@shopify/flash-list', () => {
  const { FlatList } = jest.requireActual<typeof import('react-native')>('react-native');
  return { FlashList: FlatList };
});

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
  showMonthlyStats: false,
  monthlyIncome: 0,
  monthlyExpenses: 0,
};

const mockSections: AccountSectionViewModel[] = [
  {
    title: 'Asset',
    type: 'ASSET' as any,
    count: 1,
    total: 1500,
    totalColor: '#1E1B4B',
    isCollapsed: false,
    data: [mockAccount],
    accountIds: ['acc-1' as AccountId],
  },
];

const requiredViewProps = {
  error: null,
  retry: jest.fn(),
  onToggleSectionSelect: jest.fn(),
  onAccountActionPress: jest.fn(),
  selectedAccountIds: new Set<AccountId>(),
  isSelectionModeActive: false,
  selectionChrome: {
    exitSelectionMode: jest.fn(),
    selectAll: jest.fn(),
    clearItems: jest.fn(),
    actions: [],
  },
  selectableAccountIds: [],
  modals: {
    activeModal: null,
    onCloseModal: jest.fn(),
    selectedAccountsList: [],
    selectedCount: 0,
    bulkParentCandidates: [],
    onBulkRenameSave: jest.fn().mockResolvedValue(undefined),
    onBulkHierarchyMoveAssign: jest.fn().mockResolvedValue(undefined),
    onViewDetails: jest.fn(),
    onEditAccount: jest.fn(),
    onRecolorAccount: jest.fn(),
    onReconcileAccount: jest.fn(),
    onToggleArchiveAccount: jest.fn(),
    onDeleteAccount: jest.fn(),
  },
};

describe('AccountsListView', () => {
  it('calls onAccountLongPress when account card is long-pressed', () => {
    const onAccountLongPress = jest.fn();

    const { getByText } = render(
      <AccountsListView
        sections={mockSections}
        onToggleSection={jest.fn()}
        onAccountPress={jest.fn()}
        onAccountLongPress={onAccountLongPress}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onManageHierarchy={jest.fn()}
        isLoading={false}
        version={1}
        netWorth={1500}
        totalAssets={1500}
        totalLiabilities={0}
        totalIncome={0}
        totalExpense={0}
        inflowPeriod="overall"
        setInflowPeriod={jest.fn()}
        inflowIncome={0}
        inflowExpense={0}
        isPeriodLoading={false}
        currencyCode="USD"
        activeTab="accounts"
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
      />,
    );

    fireEvent(getByText('Checking Account'), 'longPress');
    expect(onAccountLongPress).toHaveBeenCalledWith(mockAccount);
  });

  it('calls onToggleSectionSelect when section header is long-pressed', () => {
    const onToggleSectionSelect = jest.fn();

    const { getByText } = render(
      <AccountsListView
        sections={mockSections}
        onToggleSection={jest.fn()}
        onAccountPress={jest.fn()}
        onAccountLongPress={jest.fn()}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onManageHierarchy={jest.fn()}
        isLoading={false}
        version={1}
        netWorth={1500}
        totalAssets={1500}
        totalLiabilities={0}
        totalIncome={0}
        totalExpense={0}
        inflowPeriod="overall"
        setInflowPeriod={jest.fn()}
        inflowIncome={0}
        inflowExpense={0}
        isPeriodLoading={false}
        currencyCode="USD"
        activeTab="accounts"
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        onToggleSectionSelect={onToggleSectionSelect}
      />,
    );

    fireEvent(getByText('Asset'), 'longPress');
    expect(onToggleSectionSelect).toHaveBeenCalledWith(['acc-1']);
  });

  it('renders section selection checkbox in selection mode and triggers onToggleSectionSelect on press', () => {
    const onToggleSectionSelect = jest.fn();
    const onToggleSection = jest.fn();

    const view = (isSelectionModeActive: boolean) => (
      <AccountsListView
        sections={mockSections}
        onToggleSection={onToggleSection}
        onAccountPress={jest.fn()}
        onAccountLongPress={jest.fn()}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onManageHierarchy={jest.fn()}
        isLoading={false}
        version={1}
        netWorth={1500}
        totalAssets={1500}
        totalLiabilities={0}
        totalIncome={0}
        totalExpense={0}
        inflowPeriod="overall"
        setInflowPeriod={jest.fn()}
        inflowIncome={0}
        inflowExpense={0}
        isPeriodLoading={false}
        currencyCode="USD"
        activeTab="accounts"
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        isSelectionModeActive={isSelectionModeActive}
        selectedAccountIds={new Set(['acc-1' as AccountId])}
        onToggleSectionSelect={onToggleSectionSelect}
        selectableAccountIds={['acc-1' as AccountId]}
      />
    );
    const { getByTestId, getByLabelText, queryByTestId, rerender } = render(view(false));
    fireEvent.press(getByLabelText('Asset section, 1 accounts'));
    expect(onToggleSection).toHaveBeenCalledWith('Asset');
    expect(queryByTestId('section-select-asset')).toBeNull();

    rerender(view(true));
    const sectionSelectButton = getByTestId('section-select-asset');
    expect(sectionSelectButton).toBeTruthy();
    fireEvent.press(sectionSelectButton);
    expect(onToggleSectionSelect).toHaveBeenCalledWith(['acc-1']);
    rerender(view(false));
    expect(queryByTestId('section-select-asset')).toBeNull();
    expect(getByTestId('section-control-asset')).toBeTruthy();
  });

  it('shows selection indicators on selected rows', () => {
    const { getByTestId } = render(
      <AccountsListView
        sections={mockSections}
        onToggleSection={jest.fn()}
        onAccountPress={jest.fn()}
        onAccountLongPress={jest.fn()}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onManageHierarchy={jest.fn()}
        isLoading={false}
        version={1}
        netWorth={1500}
        totalAssets={1500}
        totalLiabilities={0}
        totalIncome={0}
        totalExpense={0}
        inflowPeriod="overall"
        setInflowPeriod={jest.fn()}
        inflowIncome={0}
        inflowExpense={0}
        isPeriodLoading={false}
        currencyCode="USD"
        activeTab="accounts"
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        isSelectionModeActive={true}
        selectedAccountIds={new Set(['acc-1' as AccountId])}
        selectableAccountIds={['acc-1' as AccountId]}
      />,
    );

    expect(getByTestId('account-card-selection-indicator')).toBeTruthy();
  });

  it('renders BulkRenameAccountsModal when activeModal is bulkRename', () => {
    const { getByText, getByDisplayValue } = render(
      <AccountsListView
        sections={mockSections}
        onToggleSection={jest.fn()}
        onAccountPress={jest.fn()}
        onAccountLongPress={jest.fn()}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onManageHierarchy={jest.fn()}
        isLoading={false}
        version={1}
        netWorth={1500}
        totalAssets={1500}
        totalLiabilities={0}
        totalIncome={0}
        totalExpense={0}
        inflowPeriod="overall"
        setInflowPeriod={jest.fn()}
        inflowIncome={0}
        inflowExpense={0}
        isPeriodLoading={false}
        currencyCode="USD"
        activeTab="accounts"
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        modals={{
          ...requiredViewProps.modals,
          activeModal: { type: 'bulkRename' },
          selectedAccountsList: [mockAccount],
        }}
      />,
    );

    expect(getByText('Edit Account Names')).toBeTruthy();
    expect(getByDisplayValue('Checking Account')).toBeTruthy();
  });
});
