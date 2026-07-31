import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { analytics } from '@/src/services/analytics-service';
import { AccountId, EnrichedJournal, JournalId } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJournalTransactionList } from './useJournalTransactionList';

export interface JournalSearchViewModel {
  items: TransactionListItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  onEndReached?: () => void;

  // Filters
  searchQuery: string;
  setSearchQuery: (val: string) => void;

  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  setDateRange: (range: DateRange | null, filter: PeriodFilter) => void;

  accountIds: AccountId[];
  setAccountIds: (ids: AccountId[]) => void;

  minAmount: string;
  setMinAmount: (val: string) => void;

  maxAmount: string;
  setMaxAmount: (val: string) => void;

  displayType: string; // '', 'INCOME', 'EXPENSE', 'TRANSFER'
  setDisplayType: (val: string) => void;

  clearFilters: () => void;

  hasMore: boolean;
  plannedJournals: EnrichedJournal[];
  accounts: Account[];

  // Selection
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<JournalId>>>;
}

export function useJournalSearchViewModel(): JournalSearchViewModel {
  const params = useLocalSearchParams();
  const { workplaceId } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);

  // Route Params
  const qParam = params.q as string;
  const startParam = params.startDate as string;
  const endParam = params.endDate as string;
  const accountIdsParam = params.accountIds as string;
  const minAmountParam = params.minAmount as string;
  const maxAmountParam = params.maxAmount as string;
  const displayTypeParam = params.displayType as string;

  // Filter State
  const [searchQuery, setSearchQuery] = useState(qParam || '');
  const [dateRange, setDateRangeState] = useState<DateRange | null>(() => {
    if (startParam && endParam) {
      const start = Number.parseInt(startParam, 10);
      const end = Number.parseInt(endParam, 10);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return { startDate: start, endDate: end };
      }
    }
    return null;
  });
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() => {
    if (startParam && endParam) {
      const start = Number.parseInt(startParam, 10);
      const end = Number.parseInt(endParam, 10);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return { type: 'CUSTOM' };
      }
    }
    return { type: 'ALL_TIME' };
  });
  const [accountIds, setAccountIds] = useState<AccountId[]>(() => {
    if (accountIdsParam) return accountIdsParam.split(',') as AccountId[];
    return [];
  });
  const [minAmount, setMinAmount] = useState(minAmountParam || '');
  const [maxAmount, setMaxAmount] = useState(maxAmountParam || '');
  const [displayType, setDisplayType] = useState(displayTypeParam || '');

  const setDateRange = useCallback((range: DateRange | null, filter: PeriodFilter) => {
    setDateRangeState(range);
    setPeriodFilter(filter);
  }, []);

  // Track search analytics when query changes (with debounce)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTrackedQueryRef = useRef('');

  useEffect(() => {
    const hasMeaningfulQuery =
      searchQuery.length >= 2 ||
      accountIds.length > 0 ||
      minAmount !== '' ||
      maxAmount !== '' ||
      displayType !== '' ||
      dateRange !== null;

    if (!hasMeaningfulQuery) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      const queryKey = `${searchQuery}:${accountIds.join(',')}:${minAmount}:${maxAmount}:${displayType}:${dateRange?.startDate}`;

      if (queryKey === lastTrackedQueryRef.current) return;
      lastTrackedQueryRef.current = queryKey;

      analytics.logSearchPerformed('journal', searchQuery.length);
      analytics.trackFeatureUsage('journal_search', 'query_details', {
        query_length: searchQuery.length,
        has_account_filter: accountIds.length > 0,
        account_count: accountIds.length,
        has_amount_filter: minAmount !== '' || maxAmount !== '',
        has_display_type_filter: displayType !== '',
        has_date_filter: dateRange !== null,
        period_filter_type: periodFilter.type,
      });
    }, 2000);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, accountIds, minAmount, maxAmount, displayType, dateRange, periodFilter.type]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setDateRangeState(null);
    setPeriodFilter({ type: 'ALL_TIME' });
    setAccountIds([]);
    setMinAmount('');
    setMaxAmount('');
    setDisplayType('');
  }, []);

  const queryDateRange = useMemo(
    () =>
      dateRange
        ? {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          }
        : undefined,
    [dateRange],
  );

  const queryOptions = useMemo(
    () => ({
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      displayType: displayType || undefined,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
    }),
    [minAmount, maxAmount, displayType, accountIds],
  );

  const core = useJournalTransactionList({
    workplaceId,
    pageSize: AppConfig.defaults.journalPageSize,
    dateRange: queryDateRange,
    searchQuery,
    queryOptions,
    shareTitle: 'Search Transactions',
    paginationPolicy: 'always',
  });

  return {
    items: core.items,
    isLoading: core.isLoading,
    isLoadingMore: core.isLoadingMore,
    onEndReached: core.onEndReached,
    searchQuery,
    setSearchQuery,
    dateRange,
    periodFilter,
    setDateRange,
    accountIds,
    setAccountIds,
    minAmount,
    setMinAmount,
    maxAmount,
    setMaxAmount,
    displayType,
    setDisplayType,
    clearFilters,
    hasMore: core.hasMore,
    plannedJournals: [], // Not showing planned in search for now
    accounts,
    selectedIds: core.selectedIds,
    isSelectionModeActive: core.isSelectionModeActive,
    onLongPressItem: core.onLongPressItem,
    toggleSelection: core.toggleSelection,
    selectAll: core.selectAll,
    clearItems: core.clearItems,
    exitSelectionMode: core.exitSelectionMode,
    onShareSelected: core.onShareSelected,
    setSelectedIds: core.setSelectedIds,
  };
}
