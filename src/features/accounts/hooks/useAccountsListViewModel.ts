import { getPerfNow } from '@/src/utils/dateHelpers';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  filterAccountSectionsForTab,
  filterAccountsBySearch,
  filterAccountsForListTab,
  resolveAccountListPressAction,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import { useAccountsInflowSummary } from '@/src/features/accounts/hooks/useAccountsInflowSummary';
import { getAccountIcon } from '@/src/features/accounts/utils/getAccountIcon';
import {
  AccountCardViewModel,
  transformAccountsToSections,
} from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { AccountId } from '@/src/types/domain';
import { traceService } from '@/src/utils/TraceService';
import { AppNavigation } from '@/src/utils/navigation';
import { logger } from '@/src/utils/logger';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  isRefreshing: boolean;
  onRefresh: () => void;
  onToggleSection: (title: string) => void;
  onAccountPress: (accountId: AccountId) => void;
  onCollapseAccount: (accountId: AccountId) => void;
  onCreateAccount: () => void;
  onReorderPress: () => void;
  onManageHierarchy: () => void;
  onTogglePrivacy: () => void;
  isPrivacyMode: boolean;
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
}

export function useAccountsListViewModel(): AccountsListViewModel {
  const { theme, onContrast } = useTheme();
  const { workplaceId } = useWorkplace();

  const { showAccountMonthlyStats } = useAccountDisplayPrefs();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { isPrivacyMode: isLocalPrivacyMode, togglePrivacyMode } = usePrivacyScope();

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

  const [activeTab, setActiveTab] = useState<'accounts' | 'categories'>('accounts');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Equity']));
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

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

  const onToggleSection = useCallback((title: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const onAccountPress = useCallback(
    (accountId: AccountId) => {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;

      if (resolveAccountListPressAction(accountId, accounts, expandedAccountIds) === 'expand') {
        setExpandedAccountIds(prev => {
          const next = new Set(prev);
          next.add(accountId);
          return next;
        });
      } else {
        const balance = balancesByAccountId.get(accountId);
        AppNavigation.toAccountDetails(accountId, {
          preview: {
            name: account.name,
            balance: balance?.balance,
            currency: balance?.currencyCode || account.currencyCode,
            icon: getAccountIcon(account),
            type: account.accountType,
          },
        });
      }
    },
    [accounts, expandedAccountIds, balancesByAccountId],
  );

  const onCollapseAccount = useCallback((accountId: AccountId) => {
    setExpandedAccountIds(prev => {
      const next = new Set(prev);
      next.delete(accountId);
      return next;
    });
  }, []);

  const onCreateAccount = useCallback(() => {
    if (activeTab === 'categories') {
      AppNavigation.toCategoryCreation();
    } else {
      AppNavigation.toAccountCreation();
    }
  }, [activeTab]);

  const onReorderPress = useCallback(() => {
    AppNavigation.toAccountReorder(activeTab);
  }, [activeTab]);

  const onTogglePrivacy = useCallback(() => {
    traceService.startTrace('Toggle Privacy Mode');
    togglePrivacyMode();
  }, [togglePrivacyMode]);

  const onManageHierarchy = useCallback(() => {
    AppNavigation.toManageHierarchy({ filterMode: activeTab });
  }, [activeTab]);

  const onRefresh = useCallback(() => {
    traceService.startTrace('Refresh Account List');
    // Refresh is handled reactively by observables
  }, []);

  const filteredAccounts = useMemo(
    () => filterAccountsBySearch(accounts, searchQuery),
    [accounts, searchQuery],
  );

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
    const accountsForTab = filterAccountsForListTab(filteredAccounts, activeTab);
    const rawSections = transformAccountsToSections(accountsForTab, transformOptions);
    return filterAccountSectionsForTab(rawSections, activeTab);
  }, [filteredAccounts, transformOptions, activeTab]);

  return {
    sections,
    isRefreshing: isLoading,
    onRefresh,
    onToggleSection,
    onAccountPress,
    onCollapseAccount,
    onCreateAccount,
    onReorderPress,
    onManageHierarchy,
    onTogglePrivacy,
    isPrivacyMode: isLocalPrivacyMode,
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
  };
}
