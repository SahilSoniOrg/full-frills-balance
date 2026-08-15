import { AccountsListView } from '../AccountsListView';
import { AccountSectionViewModel, AccountCardViewModel } from '../../utils/transformAccounts';
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

const mockChrome = {
  rightAction: {
    icon: 'plus' as const,
    onPress: jest.fn(),
    accessibilityLabel: 'Add account',
  },
};

const requiredViewProps = {
  onToggleSectionSelect: jest.fn(),
  onAccountActionPress: jest.fn(),
  selectedAccountIds: new Set<AccountId>(),
  isSelectionModeActive: false,
  onSelectAll: jest.fn(),
  onDeselectAll: jest.fn(),
  onClearSelection: jest.fn(),
  selectionActions: [],
  totalSelectableAccounts: 0,
  modals: {
    activeModal: null,
    onCloseModal: jest.fn(),
    selectedAccountsList: [],
    selectedCount: 0,
    bulkParentCandidates: [],
    onBulkRenameSave: jest.fn().mockResolvedValue(undefined),
    onBulkHierarchyMoveAssign: jest.fn().mockResolvedValue(undefined),
    onBulkAppearanceSelect: jest.fn().mockResolvedValue(undefined),
    onViewDetails: jest.fn(),
    onEditAccount: jest.fn(),
    onRecolorAccount: jest.fn(),
    onReconcileAccount: jest.fn(),
    onToggleArchiveAccount: jest.fn(),
    onDeleteAccount: jest.fn(),
    onAppearanceUpdate: jest.fn().mockResolvedValue(undefined),
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
        onReorderPress={jest.fn()}
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
        setActiveTab={jest.fn()}
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        chrome={mockChrome as any}
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
        onReorderPress={jest.fn()}
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
        setActiveTab={jest.fn()}
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        onToggleSectionSelect={onToggleSectionSelect}
        chrome={mockChrome as any}
      />,
    );

    fireEvent(getByText('Asset'), 'longPress');
    expect(onToggleSectionSelect).toHaveBeenCalledWith(['acc-1']);
  });

  it('renders section selection checkbox in selection mode and triggers onToggleSectionSelect on press', () => {
    const onToggleSectionSelect = jest.fn();

    const { getByTestId } = render(
      <AccountsListView
        sections={mockSections}
        onToggleSection={jest.fn()}
        onAccountPress={jest.fn()}
        onAccountLongPress={jest.fn()}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onReorderPress={jest.fn()}
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
        setActiveTab={jest.fn()}
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        isSelectionModeActive={true}
        selectedAccountIds={new Set(['acc-1' as AccountId])}
        onToggleSectionSelect={onToggleSectionSelect}
        totalSelectableAccounts={1}
        chrome={mockChrome as any}
      />,
    );

    const sectionSelectButton = getByTestId('section-select-asset');
    expect(sectionSelectButton).toBeTruthy();
    fireEvent.press(sectionSelectButton);
    expect(onToggleSectionSelect).toHaveBeenCalledWith(['acc-1']);
  });

  it('renders SelectionActionBar and selection indicators when isSelectionModeActive is true', () => {
    const onSelectAll = jest.fn();
    const onClearSelection = jest.fn();

    const { getAllByText, getByLabelText, getByTestId } = render(
      <AccountsListView
        sections={mockSections}
        onToggleSection={jest.fn()}
        onAccountPress={jest.fn()}
        onAccountLongPress={jest.fn()}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onReorderPress={jest.fn()}
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
        setActiveTab={jest.fn()}
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        isSelectionModeActive={true}
        selectedAccountIds={new Set(['acc-1' as AccountId])}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        totalSelectableAccounts={1}
        selectionActions={[
          {
            name: 'archive',
            onPress: jest.fn(),
            accessibilityLabel: 'Archive selected',
          },
        ]}
        chrome={mockChrome as any}
      />,
    );

    expect(getByTestId('account-card-selection-indicator')).toBeTruthy();
    expect(getByLabelText('Exit selection')).toBeTruthy();
    expect(getAllByText('1').length).toBeGreaterThanOrEqual(1);
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
        onReorderPress={jest.fn()}
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
        setActiveTab={jest.fn()}
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
        chrome={mockChrome as any}
      />,
    );

    expect(getByText('Edit Account Names')).toBeTruthy();
    expect(getByDisplayValue('Checking Account')).toBeTruthy();
  });

  it('renders AppearancePickerModal when activeModal is appearance and calls onAppearanceUpdate on save', () => {
    const onAppearanceUpdate = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <AccountsListView
        sections={mockSections}
        onToggleSection={jest.fn()}
        onAccountPress={jest.fn()}
        onAccountLongPress={jest.fn()}
        onCollapseAccount={jest.fn()}
        onCreateAccount={jest.fn()}
        onReorderPress={jest.fn()}
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
        setActiveTab={jest.fn()}
        searchQuery=""
        isSearching={false}
        onSearchChange={jest.fn()}
        setIsSearching={jest.fn()}
        accountsForArchiveToggle={[]}
        {...requiredViewProps}
        modals={{
          ...requiredViewProps.modals,
          activeModal: { type: 'appearance', account: mockAccount },
          onAppearanceUpdate,
        }}
        chrome={mockChrome as any}
      />,
    );

    expect(getByText('Account appearance')).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
    fireEvent.press(getByText('Done'));
    expect(onAppearanceUpdate).toHaveBeenCalledWith({
      icon: 'wallet',
      color: '#EEF2FF',
    });
  });
});
