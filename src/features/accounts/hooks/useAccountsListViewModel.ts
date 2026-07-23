import { getPerfNow } from '@/src/utils/dateHelpers';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { getAccountIcon } from '@/src/features/accounts/utils/getAccountIcon';
import {
  AccountCardViewModel,
  transformAccountsToSections,
} from '@/src/features/accounts/utils/transformAccounts';
import { AccountType } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { reportService } from '@/src/services/report-service';
import { AccountId } from '@/src/types/domain';
import { traceService } from '@/src/utils/TraceService';
import { AppNavigation } from '@/src/utils/navigation';
import { logger } from '@/src/utils/logger';
import { getCurrentMonthRange, getLastNRange } from '@/src/utils/dateUtils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { of } from 'rxjs';

export interface AccountSectionViewModel {
  title: string;
  count: number;
  totalDisplay: string;
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

  const { showAccountMonthlyStats, isPrivacyMode } = useUI();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const mountTimeRef = useRef<number>(0);
  useEffect(() => {
    mountTimeRef.current = getPerfNow();
  }, []);

  // Log UI Mount
  useEffect(() => {
    logger.info('[AccountsList] Screen Mounted');
  }, []);

  const [isLocalPrivacyMode, setIsLocalPrivacyMode] = useState<boolean>(isPrivacyMode);

  // Sync with global privacy mode when it changes (e.g. from settings)
  useEffect(() => {
    setTimeout(() => setIsLocalPrivacyMode(isPrivacyMode), 0);
  }, [isPrivacyMode]);

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

  const togglePrivacyMode = useCallback(() => setIsLocalPrivacyMode(prev => !prev), []);

  const [activeTab, setActiveTab] = useState<'accounts' | 'categories'>('accounts');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Equity']));
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [inflowPeriod, setInflowPeriodState] = useState<'overall' | 'month' | '30days'>('overall');
  const [periodTotals, setPeriodTotals] = useState<{ income: number; expense: number } | null>(
    null,
  );
  const [isPeriodLoading, setIsPeriodLoading] = useState(false);

  const setInflowPeriod = useCallback((period: 'overall' | 'month' | '30days') => {
    setInflowPeriodState(period);
    if (period === 'overall') {
      setPeriodTotals(null);
    }
  }, []);

  useEffect(() => {
    if (!workplaceId || inflowPeriod === 'overall') {
      return;
    }

    let isMounted = true;
    // Defer loading state update to avoid synchronous cascading render warning
    Promise.resolve().then(() => {
      if (isMounted) {
        setIsPeriodLoading(true);
      }
    });

    const fetchTotals = async () => {
      try {
        let startDate: number;
        let endDate: number;

        if (inflowPeriod === 'month') {
          const range = getCurrentMonthRange();
          startDate = range.startDate;
          endDate = range.endDate;
        } else {
          const range = getLastNRange(30, 'days');
          startDate = range.startDate;
          endDate = range.endDate;
        }

        const totals = await reportService.getIncomeVsExpense(
          workplaceId,
          startDate,
          endDate,
          workplaceCurrency,
        );

        if (isMounted) {
          setPeriodTotals(totals);
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

      const hasChildren = accounts.some(a => a.parentAccountId === accountId);
      const isExpanded = expandedAccountIds.has(accountId);

      if (hasChildren && !isExpanded) {
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

  const filteredAccounts = useMemo(() => {
    if (!searchQuery) return accounts;
    const lowercaseQuery = searchQuery.toLowerCase();
    return accounts.filter(a => a.name.toLowerCase().includes(lowercaseQuery));
  }, [accounts, searchQuery]);

  // M-5 fix: Memoize transform options to prevent redundant re-transformations
  // when unrelated UI state (like filters or privacy mode) haven't changed.
  const transformOptions = useMemo(
    () => ({
      balancesByAccountId,
      defaultCurrency: workplaceCurrency,
      showAccountMonthlyStats,
      isPrivacyMode: isLocalPrivacyMode,
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
      isLocalPrivacyMode,
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
    const accountsForTab = filteredAccounts.filter(a => {
      const isCategory =
        a.accountType === AccountType.INCOME || a.accountType === AccountType.EXPENSE;
      return activeTab === 'categories' ? isCategory : !isCategory;
    });
    const rawSections = transformAccountsToSections(accountsForTab, transformOptions);
    // Filter sections based on activeTab
    if (activeTab === 'accounts') {
      // Show Assets, Liabilities, Equity and fallback-other
      return rawSections.filter(
        s =>
          !s.type ||
          [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY].includes(
            s.type as AccountType,
          ),
      );
    } else {
      // Show Income and Expense
      return rawSections.filter(
        s => s.type && [AccountType.INCOME, AccountType.EXPENSE].includes(s.type as AccountType),
      );
    }
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
    inflowIncome: inflowPeriod === 'overall' ? totalIncome : periodTotals?.income || 0,
    inflowExpense: inflowPeriod === 'overall' ? totalExpense : periodTotals?.expense || 0,
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
