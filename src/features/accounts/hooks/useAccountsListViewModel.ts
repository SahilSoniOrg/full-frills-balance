import { useArchiveScopedAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
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
import { useObservable } from '@/src/hooks/useObservable';
import { useSelection } from '@/src/hooks/useSelection';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { reportService } from '@/src/services/report-service';
import { AccountId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { of } from 'rxjs';

export type {
  AccountSectionViewModel,
  AccountsListActiveModal,
  AccountsListModalsProps,
  AccountsListViewModel,
};

export function useAccountsListViewModel(): AccountsListViewModel {
  const { theme, onContrast } = useTheme();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { showAccountMonthlyStats } = useAccountDisplayPrefs();

  const [activeModal, setActiveModal] = useState<AccountsListActiveModal>(null);
  const selection = useSelection<AccountId>();
  const [activeTab, setActiveTab] = useState<AccountsListTab>('accounts');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(['Equity']),
  );
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<AccountId>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [inflowPeriod, setInflowPeriodState] = useState<AccountsListInflowPeriod>('overall');
  const [rollingPeriodTotals, setRollingPeriodTotals] = useState<{
    income: number;
    expense: number;
    hasUnvaluedEntries?: boolean;
  } | null>(null);
  const [isPeriodLoading, setIsPeriodLoading] = useState(false);

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

  const targetCurrency = workplaceCurrency;

  const {
    data: dashboardData,
    isLoading,
    error,
    retry,
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
    () =>
      (workplaceId ? reactiveDataService.getAccountsListSnapshot(workplaceId) : null) ?? {
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
    if (!workplaceId || inflowPeriod !== '30days') {
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
  }, [inflowPeriod, workplaceId, workplaceCurrency, version]);

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

  const filteredAccounts = useMemo(
    () => filterAccountsBySearch(accounts, searchQuery),
    [accounts, searchQuery],
  );

  const { visibleAccounts: displayAccounts } = useArchiveScopedAccounts(filteredAccounts);

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

  const handleTabChange = useCallback(
    (tab: 'accounts' | 'categories') => {
      selection.exitSelectionMode();
      setActiveTab(tab);
    },
    [selection, setActiveTab],
  );

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
    setActiveTab: handleTabChange,
    accountsForArchiveToggle,
  };
}
