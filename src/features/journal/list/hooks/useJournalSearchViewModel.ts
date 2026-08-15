import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { analytics } from '@/src/services/analytics-service';
import { AccountId, JournalId } from '@/src/types/domain';
import { JournalListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useLocalSearchParams } from 'expo-router';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useJournalSearchFilters } from './useJournalSearchFilters';
import { useJournalEntryList } from './useJournalEntryList';

export interface JournalSearchViewModel {
  items: JournalListItem[];
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
  accounts: Account[];

  // Filter chrome (picker visibility)
  isAccountPickerVisible: boolean;
  openAccountPicker: () => void;
  closeAccountPicker: () => void;
  isDatePickerVisible: boolean;
  openDatePicker: () => void;
  closeDatePicker: () => void;

  // Selection
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
  setSelectedIds: Dispatch<SetStateAction<Set<JournalId>>>;
}

export function useJournalSearchViewModel(): JournalSearchViewModel {
  const params = useLocalSearchParams();
  const { workplaceId } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);

  // Route Params
  const filters = useJournalSearchFilters({
    q: params.q as string,
    startDate: params.startDate as string,
    endDate: params.endDate as string,
    accountIds: params.accountIds as string,
    minAmount: params.minAmount as string,
    maxAmount: params.maxAmount as string,
    displayType: params.displayType as string,
  });

  const core = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.defaults.journalPageSize,
    dateRange: filters.queryDateRange,
    searchQuery: filters.searchQuery,
    queryOptions: filters.queryOptions,
    shareTitle: 'Search Transactions',
    paginationPolicy: 'always',
  });

  const itemsCountRef = useRef(core.items.length);
  useEffect(() => {
    itemsCountRef.current = core.items.length;
  }, [core.items.length]);

  useEffect(() => {
    if (!filters.searchQuery && filters.accountIds.length === 0 && !filters.dateRange) return;
    const timer = setTimeout(() => {
      analytics.trackFeatureUsage('search', 'query_executed', {
        query_length: filters.searchQuery.length,
        has_account_filter: filters.accountIds.length > 0,
        account_filter_count: filters.accountIds.length,
        has_date_filter: !!filters.dateRange,
        has_amount_filter: !!(filters.minAmount || filters.maxAmount),
        result_count: itemsCountRef.current,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [
    filters.searchQuery,
    filters.accountIds.length,
    filters.dateRange,
    filters.minAmount,
    filters.maxAmount,
  ]);

  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  const openAccountPicker = useCallback(() => setIsAccountPickerVisible(true), []);
  const closeAccountPicker = useCallback(() => setIsAccountPickerVisible(false), []);
  const openDatePicker = useCallback(() => setIsDatePickerVisible(true), []);
  const closeDatePicker = useCallback(() => setIsDatePickerVisible(false), []);

  const setDateRange = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      filters.setDateRange(range, filter);
      setIsDatePickerVisible(false);
    },
    [filters],
  );

  return {
    items: core.items,
    isLoading: core.isLoading,
    isLoadingMore: core.isLoadingMore,
    onEndReached: core.onEndReached,
    ...filters,
    setDateRange,
    hasMore: core.hasMore,
    accounts,
    isAccountPickerVisible,
    openAccountPicker,
    closeAccountPicker,
    isDatePickerVisible,
    openDatePicker,
    closeDatePicker,
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
