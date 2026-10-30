import { useVisibleAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  useAccountsGroupData,
  useAccountsGroupPreferences,
} from '@/src/features/accounts/AccountsGroupProvider';
import {
  AccountsListInflowPeriod,
  aggregateLeafPeriodIncomeExpense,
  AccountsListTab,
  filterAccountsBySearch,
  filterAccountSectionsForTab,
  filterAccountsForListTab,
  resolveInflowReportDateRange,
  resolveInflowTotals,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import type {
  AccountsListActiveModal,
  AccountsListModalsProps,
  AccountsListViewModel,
} from '@/src/features/accounts/hooks/accountsListTypes';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { useAccountsBulkOperations } from '@/src/features/accounts/hooks/useAccountsBulkOperations';
import { useAccountsListActions } from '@/src/features/accounts/hooks/useAccountsListActions';
import {
  AccountCardViewModel,
  AccountSectionViewModel,
  transformAccountsToSections,
} from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
import { useSelection } from '@/src/hooks/useSelection';
import { reportService } from '@/src/services/report-service';
import { AccountId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { usePrimaryPageNavigation } from '@/src/navigation/primaryPageNavigation';
import { AppNavigation } from '@/src/utils/navigation';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type {
  AccountSectionViewModel,
  AccountsListActiveModal,
  AccountsListModalsProps,
  AccountsListViewModel,
};

export function useAccountsListViewModel(
  activeTab: AccountsListTab = 'accounts',
  enabled = true,
): AccountsListViewModel {
  const routeFocused = useIsFocused();
  const isFocused = routeFocused && enabled;
  const { theme, onContrast } = useTheme();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { showAccountMonthlyStats } = useAccountDisplayPrefs();
  const { data: dashboardData, isLoading, error, retry, version } = useAccountsGroupData();
  const {
    collapsedSections,
    setCollapsedSections,
    expandedAccountIds,
    setExpandedAccountIds,
    searchQuery,
    setSearchQuery,
    isSearching,
    setIsSearching,
    inflowPeriod,
    setInflowPeriod: setInflowPeriodState,
    rollingPeriodTotals,
    setRollingPeriodTotals,
    isPeriodLoading,
    setIsPeriodLoading,
  } = useAccountsGroupPreferences();
  const pageNavigation = usePrimaryPageNavigation();

  const [activeModal, setActiveModal] = useState<AccountsListActiveModal>(null);
  const selection = useSelection<AccountId>();
  useEffect(() => {
    const lockId = `accounts-modal:${activeTab}`;
    pageNavigation?.setPageSwipeLock(lockId, activeModal !== null);
    return () => pageNavigation?.setPageSwipeLock(lockId, false);
  }, [activeModal, activeTab, pageNavigation?.setPageSwipeLock]);
  const setActiveTab = useCallback(
    (tab: AccountsListTab) => {
      selection.exitSelectionMode();
      if (pageNavigation) pageNavigation.navigateToPage(tab);
      else AppNavigation.toPrimaryPage(tab);
    },
    [pageNavigation, selection.exitSelectionMode],
  );
  const focusStartVersion = useRef<number | null>(null);
  const wasFocused = useRef(isFocused);

  useEffect(() => {
    if (wasFocused.current && !isFocused) selection.exitSelectionMode();
    wasFocused.current = isFocused;
  }, [isFocused, selection.exitSelectionMode]);

  const onToggleSection = useCallback((title: string) => {
    setCollapsedSections(previous => {
      const next = new Set(previous);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const onCollapseAccount = useCallback((accountId: AccountId) => {
    setExpandedAccountIds(previous => {
      const next = new Set(previous);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }, []);

  const setInflowPeriod = useCallback((period: AccountsListInflowPeriod) => {
    setInflowPeriodState(period);
    if (period !== '30days') {
      setRollingPeriodTotals(null);
    }
  }, []);

  const accounts = dashboardData.accounts;

  const balancesByAccountId = useMemo(
    () => new Map(dashboardData.balances.map(b => [b.accountId, b])),
    [dashboardData.balances],
  );

  const { netWorth, totalAssets, totalLiabilities, totalEquity, totalIncome, totalExpense } =
    dashboardData.wealthSummary;

  const monthPeriodTotals = useMemo(() => {
    if (inflowPeriod !== 'month') return null;
    return aggregateLeafPeriodIncomeExpense(accounts, dashboardData.balances);
  }, [inflowPeriod, accounts, dashboardData.balances]);

  useEffect(() => {
    if (!isFocused) {
      focusStartVersion.current = null;
      return;
    }
    // Refocus first replays the latest aggregate. Wait for that emission rather
    // than fetching once for the retained version and again for the fresh one.
    if (focusStartVersion.current === null) focusStartVersion.current = version;
    if (version === focusStartVersion.current || !workplaceId || inflowPeriod !== '30days') {
      return;
    }

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        setIsPeriodLoading(true);
      }
    });

    const fetchTotals = async () => {
      try {
        const range = resolveInflowReportDateRange(inflowPeriod);
        if (!range) return;

        const { startDate, endDate } = range;
        const totals = await reportService.getIncomeVsExpense(
          workplaceId,
          startDate,
          endDate,
          workplaceCurrency,
        );

        if (isMounted) {
          setRollingPeriodTotals(totals);
          setIsPeriodLoading(false);
        }
      } catch (err) {
        logger.error('Failed to fetch period totals:', err);
        if (isMounted) {
          setIsPeriodLoading(false);
        }
      }
    };

    fetchTotals();

    return () => {
      isMounted = false;
    };
  }, [isFocused, inflowPeriod, workplaceId, workplaceCurrency, version]);

  const periodTotals = inflowPeriod === 'month' ? monthPeriodTotals : rollingPeriodTotals;
  const { inflowIncome, inflowExpense } = useMemo(
    () =>
      resolveInflowTotals({
        inflowPeriod,
        totalIncome,
        totalExpense,
        periodTotals,
      }),
    [inflowPeriod, totalIncome, totalExpense, periodTotals],
  );
  const hasUnvaluedEntries =
    inflowPeriod === '30days' && rollingPeriodTotals?.hasUnvaluedEntries === true;

  const accountsForArchiveToggle = useMemo(
    () => filterAccountsForListTab(accounts, activeTab),
    [accounts, activeTab],
  );

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

  const visibleAccounts = useVisibleAccounts(accounts);
  const displayAccounts = useMemo(
    () => filterAccountsBySearch(visibleAccounts, searchQuery),
    [visibleAccounts, searchQuery],
  );

  const allSelectableAccountIds = useMemo(() => {
    const tabAccounts = filterAccountsForListTab(displayAccounts, activeTab);
    return tabAccounts.map(a => a.id);
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
      selection.onLongPressItem(account.id);
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
    selection,
    isBulkHierarchyOpen: activeModal?.type === 'bulkHierarchy',
    openModal: setActiveModal,
    closeModal: onCloseModal,
    applyArchiveChanges,
  });

  const modals: AccountsListModalsProps = useMemo(
    () => ({
      activeModal,
      onCloseModal,
      selectedAccountsList: bulk.selectedAccountsList,
      selectedCount: selection.selectedIds.size,
      bulkParentCandidates: bulk.bulkParentCandidates,
      onBulkRenameSave: bulk.handleBulkRenameSave,
      onBulkHierarchyMoveAssign: bulk.handleBulkHierarchyMoveAssign,
      onBulkAppearanceSelect: bulk.handleBulkAppearanceSelect,
      onViewDetails: actions.onViewDetails,
      onEditAccount: actions.onEditAccount,
      onRecolorAccount: actions.onRecolorAccount,
      onReconcileAccount: actions.onReconcileAccount,
      onToggleArchiveAccount: actions.onToggleArchiveAccount,
      onDeleteAccount: actions.onDeleteAccount,
      onAppearanceUpdate: actions.onAppearanceUpdate,
    }),
    [activeModal, onCloseModal, bulk, selection.selectedIds.size, actions],
  );

  const handleSelectAll = useCallback(() => {
    selection.selectAll(allSelectableAccountIds);
  }, [selection, allSelectableAccountIds]);

  const selectionChrome = useMemo(
    () => ({
      exitSelectionMode: selection.exitSelectionMode,
      selectAll: handleSelectAll,
      clearItems: selection.clearItems,
      actions: bulk.selectionActions,
    }),
    [selection.exitSelectionMode, handleSelectAll, selection.clearItems, bulk.selectionActions],
  );

  return {
    sections,
    onToggleSection,
    onToggleSectionSelect: selection.toggleMultiple,
    onAccountPress,
    onAccountLongPress,
    onAccountActionPress,
    selectedAccountIds: selection.selectedIds,
    isSelectionModeActive: selection.isSelectionModeActive,
    selectionChrome,
    totalSelectableAccounts: allSelectableAccountIds.length,
    modals,
    onCollapseAccount,
    onCreateAccount: actions.onCreateAccount,
    onManageHierarchy: actions.onManageHierarchy,
    isLoading,
    error,
    retry,
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
    hasUnvaluedEntries,
    currencyCode: workplaceCurrency,
    searchQuery,
    isSearching,
    onSearchChange: setSearchQuery,
    setIsSearching,
    activeTab,
    setActiveTab,
    accountsForArchiveToggle,
  };
}
