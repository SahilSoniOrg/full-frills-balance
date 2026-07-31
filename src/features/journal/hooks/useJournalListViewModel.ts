import { getPerfNow } from '@/src/utils/dateHelpers';
import { AppConfig } from '@/src/constants';
import { JournalStatus } from '@/src/data/models/Journal';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJournalTransactionList } from '../list/hooks/useJournalTransactionList';

export interface JournalListEmptyState {
  title: string;
  subtitle: string;
}

export interface JournalListViewModel {
  items: TransactionListItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  onEndReached?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isSearchGlobal: boolean;
  toggleSearchGlobal: () => void;
  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  isDatePickerVisible: boolean;
  showDatePicker: () => void;
  hideDatePicker: () => void;
  navigatePrevious?: () => void;
  navigateNext?: () => void;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  hasMore: boolean;
  emptyState: JournalListEmptyState;
  loadingText: string;
  loadingMoreText: string;
  plannedJournals: EnrichedJournal[];
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

interface UseJournalListViewModelParams {
  pageSize?: number;
  emptyState: JournalListEmptyState;
  loadingText?: string;
  loadingMoreText?: string;
  initialDateRange?: DateRange | null;
  defaultToCurrentMonth?: boolean;
  initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
}

const PLANNED_STATUS = [JournalStatus.PLANNED];

export function useJournalListViewModel(
  {
    pageSize = AppConfig.defaults.journalPageSize,
    emptyState,
    loadingText = AppConfig.strings.common.loading,
    loadingMoreText = AppConfig.strings.common.loading,
    initialDateRange,
    defaultToCurrentMonth = true,
    initialItems,
  }: UseJournalListViewModelParams,
  workplaceId: WorkplaceId,
): JournalListViewModel {
  const mountTimeRef = useRef<number | null>(null);
  if (mountTimeRef.current === null) mountTimeRef.current = getPerfNow();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchGlobal, setIsSearchGlobal] = useState(true);

  const {
    dateRange,
    periodFilter,
    isPickerVisible: isDatePickerVisible,
    showPicker: showDatePicker,
    hidePicker: hideDatePicker,
    setFilter,
    navigatePrevious,
    navigateNext,
  } = useDateRangeFilter({ defaultToCurrentMonth, initialDateRange });

  const effectiveDateRange = useMemo(() => {
    if (searchQuery && isSearchGlobal) return undefined;
    return dateRange || undefined;
  }, [searchQuery, isSearchGlobal, dateRange]);

  const core = useJournalTransactionList({
    workplaceId,
    pageSize,
    dateRange: effectiveDateRange,
    searchQuery,
    initialItems,
    shareTitle: 'Transactions Report',
    paginationPolicy: 'default',
  });

  useEffect(() => {
    if (!core.isLoading && core.journals.length > 0) {
      const duration = Math.round(getPerfNow() - (mountTimeRef.current ?? 0));
      logger.info(`[JournalList] Data Loaded (Count: ${core.journals.length}) in ${duration}ms`);
      logger.metric('JournalList.LoadTime', duration);
    }
  }, [core.isLoading, core.journals.length]);

  const { journals: plannedJournals } = useJournals(
    workplaceId,
    AppConfig.defaults.plannedJournalLimit,
    undefined,
    undefined,
    PLANNED_STATUS,
  );

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (value.length > 0 && !searchQuery) {
        setIsSearchGlobal(true);
      }
    },
    [searchQuery],
  );

  const toggleSearchGlobal = useCallback(() => {
    setIsSearchGlobal(prev => !prev);
  }, []);

  const onDateSelect = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      setFilter(range, filter);
      setIsSearchGlobal(false);
      hideDatePicker();
    },
    [hideDatePicker, setFilter],
  );

  return {
    items: core.items,
    isLoading: core.isLoading,
    isLoadingMore: core.isLoadingMore,
    onEndReached: core.onEndReached,
    searchQuery,
    onSearchChange,
    isSearchGlobal,
    toggleSearchGlobal,
    dateRange,
    periodFilter,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    hasMore: core.hasMore,
    emptyState,
    loadingText,
    loadingMoreText,
    plannedJournals,
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
