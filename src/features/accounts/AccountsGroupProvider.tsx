import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  reactiveDataService,
  type LiveAccountsSummaryData,
} from '@/src/services/ReactiveDataService';
import { useObservable } from '@/src/hooks/useObservable';
import type { AccountId } from '@/src/types/ids';
import React, { createContext, useContext, useMemo, useState } from 'react';
import { EMPTY, of } from 'rxjs';

type AccountsGroupDataValue = {
  data: LiveAccountsSummaryData;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
  version: number;
};

type AccountsGroupPreferencesValue = {
  collapsedSections: Set<string>;
  setCollapsedSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedAccountIds: Set<AccountId>;
  setExpandedAccountIds: React.Dispatch<React.SetStateAction<Set<AccountId>>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isSearching: boolean;
  setIsSearching: React.Dispatch<React.SetStateAction<boolean>>;
  inflowPeriod: 'overall' | 'month' | '30days';
  setInflowPeriod: React.Dispatch<React.SetStateAction<'overall' | 'month' | '30days'>>;
  rollingPeriodTotals: {
    income: number;
    expense: number;
    hasUnvaluedEntries?: boolean;
  } | null;
  setRollingPeriodTotals: React.Dispatch<
    React.SetStateAction<{
      income: number;
      expense: number;
      hasUnvaluedEntries?: boolean;
    } | null>
  >;
  isPeriodLoading: boolean;
  setIsPeriodLoading: React.Dispatch<React.SetStateAction<boolean>>;
};

const EMPTY_DATA: LiveAccountsSummaryData = {
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
};

const AccountsGroupDataContext = createContext<AccountsGroupDataValue | null>(null);
const AccountsGroupPreferencesContext = createContext<AccountsGroupPreferencesValue | null>(null);

export function AccountsGroupProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const {
    data = EMPTY_DATA,
    isLoading,
    error,
    retry,
    version,
  } = useObservable(
    () => {
      if (!active) return EMPTY;
      return workplaceId
        ? reactiveDataService.observeOptimizedAccountList(defaultCurrencyCode, workplaceId)
        : of(EMPTY_DATA);
    },
    [active, defaultCurrencyCode, workplaceId],
    () =>
      (workplaceId ? reactiveDataService.getAccountsListSnapshot(workplaceId) : null) ?? EMPTY_DATA,
  );

  const [collapsedSections, setCollapsedSections] = useState(() => new Set(['Equity']));
  const [expandedAccountIds, setExpandedAccountIds] = useState(() => new Set<AccountId>());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [inflowPeriod, setInflowPeriod] = useState<'overall' | 'month' | '30days'>('overall');
  const [rollingPeriodTotals, setRollingPeriodTotals] = useState<{
    income: number;
    expense: number;
    hasUnvaluedEntries?: boolean;
  } | null>(null);
  const [isPeriodLoading, setIsPeriodLoading] = useState(false);

  const dataValue = useMemo(
    () => ({ data, isLoading, error, retry, version }),
    [data, isLoading, error, retry, version],
  );
  const preferencesValue = useMemo(
    () => ({
      collapsedSections,
      setCollapsedSections,
      expandedAccountIds,
      setExpandedAccountIds,
      searchQuery,
      setSearchQuery,
      isSearching,
      setIsSearching,
      inflowPeriod,
      setInflowPeriod,
      rollingPeriodTotals,
      setRollingPeriodTotals,
      isPeriodLoading,
      setIsPeriodLoading,
    }),
    [
      collapsedSections,
      expandedAccountIds,
      searchQuery,
      isSearching,
      inflowPeriod,
      rollingPeriodTotals,
      isPeriodLoading,
    ],
  );

  return (
    <AccountsGroupDataContext.Provider value={dataValue}>
      <AccountsGroupPreferencesContext.Provider value={preferencesValue}>
        <ArchiveVisibilityScopeProvider active={active}>{children}</ArchiveVisibilityScopeProvider>
      </AccountsGroupPreferencesContext.Provider>
    </AccountsGroupDataContext.Provider>
  );
}

export function useAccountsGroupData(): AccountsGroupDataValue {
  const value = useContext(AccountsGroupDataContext);
  if (!value) throw new Error('useAccountsGroupData must be used within AccountsGroupProvider');
  return value;
}

export function useAccountsGroupPreferences(): AccountsGroupPreferencesValue {
  const value = useContext(AccountsGroupPreferencesContext);
  if (!value) {
    throw new Error('useAccountsGroupPreferences must be used within AccountsGroupProvider');
  }
  return value;
}
