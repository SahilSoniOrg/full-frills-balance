import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { AccountId, JournalId } from '@/src/types/domain';
import { JournalListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useLocalSearchParams } from 'expo-router';
import type { Dispatch, SetStateAction } from 'react';
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

  return {
    items: core.items,
    isLoading: core.isLoading,
    isLoadingMore: core.isLoadingMore,
    onEndReached: core.onEndReached,
    ...filters,
    hasMore: core.hasMore,
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
