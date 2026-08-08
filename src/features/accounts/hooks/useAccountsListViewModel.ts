import { getPerfNow } from '@/src/utils/dateHelpers';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  filterAccountSectionsForTab,
  filterAccountsBySearch,
  filterAccountsForListTab,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import { useAccountsListActions } from '@/src/features/accounts/hooks/useAccountsListActions';
import { useAccountsInflowSummary } from '@/src/features/accounts/hooks/useAccountsInflowSummary';
import { useAccountsListUiState } from '@/src/features/accounts/hooks/useAccountsListUiState';
import {
  AccountCardViewModel,
  transformAccountsToSections,
} from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { AccountId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { useArchiveScopedAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import { useEffect, useMemo, useRef } from 'react';
import { of } from 'rxjs';

export interface AccountSectionViewModel {
  title: string;
  count: number;
  total: number;
  totalColor: string;
  isCollapsed: boolean;
  data: AccountCardViewModel[];
}

export interface AccountsListViewModel {
  sections: AccountSectionViewModel[];
  onToggleSection: (title: string) => void;
  onAccountPress: (accountId: AccountId) => void;
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
  // Search
  searchQuery: string;
  isSearching: boolean;
  onSearchChange: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  /** Tab-scoped accounts for the show-archived header control. */
  accountsForArchiveToggle: { archivedAt?: Date | number | null }[];
}

export function useAccountsListViewModel(): AccountsListViewModel {
  const { theme, onContrast } = useTheme();
  const { workplaceId } = useWorkplace();

  const { showAccountMonthlyStats } = useAccountDisplayPrefs();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const mountTimeRef = useRef<number>(0);
  useEffect(() => {
    mountTimeRef.current = getPerfNow();
  }, []);

  // Log UI Mount
  useEffect(() => {
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

  // Log Data Arrival
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

  const { onAccountPress, onCreateAccount, onReorderPress, onManageHierarchy } =
    useAccountsListActions({
      accounts,
      balancesByAccountId,
      expandedAccountIds,
      setExpandedAccountIds,
      activeTab,
    });

  const filteredAccounts = useMemo(
    () => filterAccountsBySearch(accounts, searchQuery),
    [accounts, searchQuery],
  );

  const { visibleAccounts: displayAccounts } = useArchiveScopedAccounts(filteredAccounts);

  // M-5 fix: Memoize transform options to prevent redundant re-transformations
  // when unrelated UI state (like filters or privacy mode) haven't changed.
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

  return {
    sections,
    onToggleSection,
    onAccountPress,
    onCollapseAccount,
    onCreateAccount,
    onReorderPress,
    onManageHierarchy,
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
    setActiveTab,
    accountsForArchiveToggle,
  };
}
