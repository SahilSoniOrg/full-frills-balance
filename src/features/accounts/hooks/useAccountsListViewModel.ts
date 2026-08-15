import { useArchiveScopedAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  filterAccountsBySearch,
  filterAccountsForListTab,
  filterAccountSectionsForTab,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import { HierarchyCandidateAccount } from '@/src/features/accounts/helpers/bulkHierarchyCandidates';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { useAccountsBulkOperations } from '@/src/features/accounts/hooks/useAccountsBulkOperations';
import { useAccountsInflowSummary } from '@/src/features/accounts/hooks/useAccountsInflowSummary';
import { useAccountsListActions } from '@/src/features/accounts/hooks/useAccountsListActions';
import { useAccountsListUiState } from '@/src/features/accounts/hooks/useAccountsListUiState';
import {
  AccountCardViewModel,
  AccountSectionViewModel,
  transformAccountsToSections,
} from '@/src/features/accounts/utils/transformAccounts';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
import { useObservable } from '@/src/hooks/useObservable';
import { useSelection } from '@/src/hooks/useSelection';
import { useTheme } from '@/src/hooks/use-theme';
import type { SelectionAction } from '@/src/components/common/SelectionActionBar';
import { IconName } from '@/src/components/core';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { AccountId } from '@/src/types/domain';
import { getPerfNow } from '@/src/utils/dateHelpers';
import { logger } from '@/src/utils/logger';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { of } from 'rxjs';

export type { AccountSectionViewModel };

export type AccountsListActiveModal =
  | { type: 'actionSheet'; account: AccountCardViewModel }
  | { type: 'appearance'; account: AccountCardViewModel }
  | { type: 'bulkRename' }
  | { type: 'bulkAppearance'; mode: 'icon' | 'color' }
  | { type: 'bulkHierarchy' }
  | null;

export interface AccountsListViewModel {
  sections: AccountSectionViewModel[];
  onToggleSection: (title: string) => void;
  onToggleSectionSelect: (accountIds: AccountId[]) => void;
  onAccountPress: (accountId: AccountId) => void;
  onAccountLongPress: (account: AccountCardViewModel) => void;
  onAccountActionPress: (account: AccountCardViewModel) => void;
  selectedAccountIds: Set<AccountId>;
  selectedAccountsList: AccountCardViewModel[];
  isSelectionModeActive: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClearSelection: () => void;
  selectionActions: SelectionAction[];
  totalSelectableAccounts: number;
  activeModal: AccountsListActiveModal;
  onCloseModal: () => void;
  onBulkRenameSave: (namesByAccountId: Record<AccountId, string>) => Promise<void>;
  onBulkHierarchyMoveAssign: (parentId: AccountId | null) => Promise<void>;
  onBulkAppearanceSelect: (updates: { icon?: IconName; color?: string }) => Promise<void>;
  bulkParentCandidates: HierarchyCandidateAccount[];
  onViewDetails: (account: AccountCardViewModel) => void;
  onEditAccount: (account: AccountCardViewModel) => void;
  onRecolorAccount: (account: AccountCardViewModel) => void;
  onReconcileAccount: (account: AccountCardViewModel) => void;
  onToggleArchiveAccount: (account: AccountCardViewModel) => void;
  onDeleteAccount: (account: AccountCardViewModel) => void;
  onAppearanceUpdate: (updates: { icon?: IconName; color?: string }) => Promise<void>;
  onCollapseAccount: (accountId: AccountId) => void;
  onCreateAccount: () => void;
  onReorderPress: () => void;
  onManageHierarchy: () => void;
  isLoading: boolean;
  version: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  totalIncome: number;
  totalExpense: number;
  inflowPeriod: 'overall' | 'month' | '30days';
  setInflowPeriod: (period: 'overall' | 'month' | '30days') => void;
  inflowIncome: number;
  inflowExpense: number;
  isPeriodLoading: boolean;
  currencyCode: string;
  activeTab: 'accounts' | 'categories';
  setActiveTab: (tab: 'accounts' | 'categories') => void;
  searchQuery: string;
  isSearching: boolean;
  onSearchChange: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  accountsForArchiveToggle: { archivedAt?: Date | number | null }[];
}

export function useAccountsListViewModel(): AccountsListViewModel {
  const { theme, onContrast } = useTheme();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { showAccountMonthlyStats } = useAccountDisplayPrefs();

  const [activeModal, setActiveModal] = useState<AccountsListActiveModal>(null);
  const selection = useSelection<AccountId>();

  const mountTimeRef = useRef<number>(0);
  useEffect(() => {
    mountTimeRef.current = getPerfNow();
    logger.info('[AccountsList] Screen Mounted');
  }, []);

  const targetCurrency = workplaceCurrency;

  const {
    data: dashboardData,
    isLoading,
    version,
  } = useObservable(
    () =>
      workplaceId
        ? reactiveDataService.observeOptimizedAccountList(targetCurrency, workplaceId)
        : of({
            accounts: [],
            balances: [],
            wealthSummary: {
              netWorth: 0,
              totalAssets: 0,
              totalLiabilities: 0,
              totalEquity: 0,
              totalIncome: 0,
              totalExpense: 0,
            },
          }),
    [targetCurrency, workplaceId],
    {
      accounts: [],
      balances: [],
      wealthSummary: {
        netWorth: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        totalIncome: 0,
        totalExpense: 0,
      },
    },
  );

  const hasData = !!(dashboardData.accounts.length > 0 || dashboardData.balances.length > 0);

  useEffect(() => {
    if (hasData) {
      const duration = Math.round(getPerfNow() - (mountTimeRef.current || 0));
      logger.info(`[AccountsList] Data Loaded in ${duration}ms`);
      logger.metric('AccountsList.DataLoaded', duration);
    }
  }, [hasData]);

  const accounts = dashboardData.accounts;

  const balancesByAccountId = useMemo(
    () => new Map(dashboardData.balances.map(b => [b.accountId, b])),
    [dashboardData.balances],
  );

  const { netWorth, totalAssets, totalLiabilities, totalEquity, totalIncome, totalExpense } =
    dashboardData.wealthSummary;

  const {
    activeTab,
    setActiveTab,
    collapsedSections,
    expandedAccountIds,
    setExpandedAccountIds,
    searchQuery,
    setSearchQuery,
    isSearching,
    setIsSearching,
    onToggleSection,
    onCollapseAccount,
  } = useAccountsListUiState();

  const accountsForArchiveToggle = useMemo(
    () => filterAccountsForListTab(accounts, activeTab),
    [accounts, activeTab],
  );

  const { inflowPeriod, setInflowPeriod, inflowIncome, inflowExpense, isPeriodLoading } =
    useAccountsInflowSummary({
      workplaceId,
      workplaceCurrency,
      accounts,
      balances: dashboardData.balances,
      totalIncome,
      totalExpense,
      dataVersion: version,
    });

  const { applyArchiveChanges } = useAccountActions(workplaceId);

  const onCloseModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const actions = useAccountsListActions({
    workplaceId,
    accounts,
    balancesByAccountId,
    expandedAccountIds,
    setExpandedAccountIds,
    activeTab,
    activeModal,
    openModal: setActiveModal,
    closeModal: onCloseModal,
    applyArchiveChanges,
  });

  const filteredAccounts = useMemo(
    () => filterAccountsBySearch(accounts, searchQuery),
    [accounts, searchQuery],
  );

  const { visibleAccounts: displayAccounts } = useArchiveScopedAccounts(filteredAccounts);

  const allSelectableAccountIds = useMemo(() => {
    const tabAccounts = filterAccountsForListTab(displayAccounts, activeTab);
    return tabAccounts.map(a => a.id as AccountId);
  }, [displayAccounts, activeTab]);

  const onAccountPress = useCallback(
    (accountId: AccountId) => {
      if (selection.isSelectionModeActive) {
        selection.toggleSelection(accountId);
        return;
      }
      actions.onAccountPress(accountId);
    },
    [selection, actions],
  );

  const onAccountLongPress = useCallback(
    (account: AccountCardViewModel) => {
      selection.onLongPressItem(account.id as AccountId);
    },
    [selection],
  );

  const onAccountActionPress = useCallback(
    (account: AccountCardViewModel) => {
      if (!selection.isSelectionModeActive) {
        setActiveModal({ type: 'actionSheet', account });
      }
    },
    [selection.isSelectionModeActive],
  );

  const transformOptions = useMemo(
    () => ({
      balancesByAccountId,
      defaultCurrency: workplaceCurrency,
      showAccountMonthlyStats,
      isLoading,
      collapsedSections,
      expandedAccountIds,
      theme,
      onContrast,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalIncome,
      totalExpense,
    }),
    [
      balancesByAccountId,
      workplaceCurrency,
      showAccountMonthlyStats,
      isLoading,
      collapsedSections,
      expandedAccountIds,
      theme,
      onContrast,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalIncome,
      totalExpense,
    ],
  );

  const sections = useMemo(() => {
    const accountsForTab = filterAccountsForListTab(displayAccounts, activeTab);
    const rawSections = transformAccountsToSections(accountsForTab, transformOptions);
    return filterAccountSectionsForTab(rawSections, activeTab);
  }, [displayAccounts, transformOptions, activeTab]);

  const bulk = useAccountsBulkOperations({
    workplaceId,
    accounts,
    sections,
    selection,
    isBulkHierarchyOpen: activeModal?.type === 'bulkHierarchy',
    openModal: setActiveModal,
    closeModal: onCloseModal,
    applyArchiveChanges,
  });

  const handleTabChange = useCallback(
    (tab: 'accounts' | 'categories') => {
      selection.exitSelectionMode();
      setActiveTab(tab);
    },
    [selection, setActiveTab],
  );

  return {
    sections,
    onToggleSection,
    onToggleSectionSelect: selection.toggleMultiple,
    onAccountPress,
    onAccountLongPress,
    onAccountActionPress,
    selectedAccountIds: selection.selectedIds,
    selectedAccountsList: bulk.selectedAccountsList,
    isSelectionModeActive: selection.isSelectionModeActive,
    onSelectAll: () => selection.selectAll(allSelectableAccountIds),
    onDeselectAll: selection.clearItems,
    onClearSelection: selection.exitSelectionMode,
    selectionActions: bulk.selectionActions,
    totalSelectableAccounts: allSelectableAccountIds.length,
    activeModal,
    onCloseModal,
    onBulkRenameSave: bulk.handleBulkRenameSave,
    onBulkHierarchyMoveAssign: bulk.handleBulkHierarchyMoveAssign,
    onBulkAppearanceSelect: bulk.handleBulkAppearanceSelect,
    bulkParentCandidates: bulk.bulkParentCandidates,
    onViewDetails: actions.onViewDetails,
    onEditAccount: actions.onEditAccount,
    onRecolorAccount: actions.onRecolorAccount,
    onReconcileAccount: actions.onReconcileAccount,
    onToggleArchiveAccount: actions.onToggleArchiveAccount,
    onDeleteAccount: actions.onDeleteAccount,
    onAppearanceUpdate: actions.onAppearanceUpdate,
    onCollapseAccount,
    onCreateAccount: actions.onCreateAccount,
    onReorderPress: actions.onReorderPress,
    onManageHierarchy: actions.onManageHierarchy,
    isLoading,
    version,
    netWorth,
    totalAssets,
    totalLiabilities,
    totalIncome,
    totalExpense,
    inflowPeriod,
    setInflowPeriod,
    inflowIncome,
    inflowExpense,
    isPeriodLoading,
    currencyCode: workplaceCurrency,
    searchQuery,
    isSearching,
    onSearchChange: setSearchQuery,
    setIsSearching,
    activeTab,
    setActiveTab: handleTabChange,
    accountsForArchiveToggle,
  };
}
