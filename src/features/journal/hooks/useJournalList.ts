import {
  type JournalDatePickerBundle,
  type JournalListBundle,
  type JournalPeriodBarBundle,
  type JournalSelectionBundle,
} from '@/src/features/journal/components/JournalListView';
import type { JournalListModalsProps } from '@/src/features/journal/components/JournalListModals';
import { AppConfig } from '@/src/constants';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { EnrichedJournal, WorkplaceId } from '@/src/types/domain';
import { getPerfNow } from '@/src/utils/dateHelpers';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useJournalEntryList } from '../list/hooks/useJournalEntryList';
import { useJournalsBulkOperations } from '@/src/features/journal/hooks/useJournalsBulkOperations';

export type JournalListEmptyState = {
  title: string;
  subtitle: string;
};

export type UseJournalListParams = {
  pageSize?: number;
  emptyState: JournalListEmptyState;
  loadingText?: string;
  loadingMoreText?: string;
  initialDateRange?: DateRange | null;
  defaultToCurrentMonth?: boolean;
  initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
};

export type JournalListModel = {
  list: Omit<JournalListBundle, 'listHeader' | 'listContentStyle'>;
  datePicker: JournalDatePickerBundle;
  selection: JournalSelectionBundle;
  periodBar: JournalPeriodBarBundle;
  modals: JournalListModalsProps;
  /** For Selection-mode nav chrome. */
  isSelectionModeActive: boolean;
  exitSelectionMode: () => void;
};

/**
 * Journal list tab module: date range + render bundles over the shared pipeline.
 */
export function useJournalList(
  {
    pageSize = AppConfig.defaults.journalPageSize,
    emptyState,
    loadingText = AppConfig.strings.common.loading,
    loadingMoreText = AppConfig.strings.common.loading,
    initialDateRange,
    defaultToCurrentMonth = true,
    initialItems,
  }: UseJournalListParams,
  workplaceId: WorkplaceId,
): JournalListModel {
  const mountTimeRef = useRef<number | null>(null);
  if (mountTimeRef.current === null) mountTimeRef.current = getPerfNow();

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

  const core = useJournalEntryList({
    workplaceId,
    pageSize,
    dateRange: dateRange || undefined,
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

  const onDateSelect = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      setFilter(range, filter);
      hideDatePicker();
    },
    [hideDatePicker, setFilter],
  );

  const {
    items: coreItems,
    isLoading: coreIsLoading,
    isLoadingMore: coreIsLoadingMore,
    onEndReached: coreOnEndReached,
    selectedIds: coreSelectedIds,
    isSelectionModeActive: coreIsSelectionModeActive,
    onLongPressItem: coreOnLongPressItem,
    toggleSelection: coreToggleSelection,
    toggleMultiple: coreToggleMultiple,
    selectAll: coreSelectAll,
    clearItems: coreClearItems,
    exitSelectionMode: coreExitSelectionMode,
    onShareSelected: coreOnShareSelected,
    setSelectedIds: coreSetSelectedIds,
    journals: coreJournals,
  } = core;

  const bulkSelection = useMemo(
    () => ({
      selectedIds: coreSelectedIds,
      isSelectionModeActive: coreIsSelectionModeActive,
      onLongPressItem: coreOnLongPressItem,
      toggleSelection: coreToggleSelection,
      toggleMultiple: coreToggleMultiple,
      selectAll: coreSelectAll,
      clearItems: coreClearItems,
      exitSelectionMode: coreExitSelectionMode,
      setSelectedIds: coreSetSelectedIds,
    }),
    [
      coreSelectedIds,
      coreIsSelectionModeActive,
      coreOnLongPressItem,
      coreToggleSelection,
      coreToggleMultiple,
      coreSelectAll,
      coreClearItems,
      coreExitSelectionMode,
      coreSetSelectedIds,
    ],
  );

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: coreJournals,
    selection: bulkSelection,
    onShareSelected: coreOnShareSelected,
  });

  const list = useMemo(
    (): JournalListModel['list'] => ({
      items: coreItems,
      isLoading: coreIsLoading,
      isLoadingMore: coreIsLoadingMore,
      loadingText,
      loadingMoreText,
      emptyTitle: emptyState.title,
      emptySubtitle: emptyState.subtitle,
      onEndReached: coreOnEndReached,
    }),
    [
      coreItems,
      coreIsLoading,
      coreIsLoadingMore,
      coreOnEndReached,
      loadingText,
      loadingMoreText,
      emptyState.title,
      emptyState.subtitle,
    ],
  );

  const datePicker = useMemo(
    (): JournalDatePickerBundle => ({
      visible: isDatePickerVisible,
      onClose: hideDatePicker,
      currentFilter: periodFilter,
      onSelect: onDateSelect,
    }),
    [isDatePickerVisible, hideDatePicker, periodFilter, onDateSelect],
  );

  const modals = useMemo(
    (): JournalListModalsProps => ({
      activeModal: bulkOperations.activeModal,
      workplaceId,
      onCloseModal: bulkOperations.closeModal,
      onBulkRenameSave: bulkOperations.handleBulkRenameSave,
      onMergeConfirm: bulkOperations.handleMergeConfirm,
      onBulkChangeAccountSelect: bulkOperations.handleBulkChangeAccountSelect,
    }),
    [bulkOperations, workplaceId],
  );

  const selection = useMemo(
    (): JournalSelectionBundle => ({
      selectedIds: coreSelectedIds,
      isSelectionModeActive: coreIsSelectionModeActive,
      onLongPressItem: coreOnLongPressItem,
      toggleSelection: coreToggleSelection,
      selectAll: coreSelectAll,
      clearItems: coreClearItems,
      exitSelectionMode: coreExitSelectionMode,
      onShareSelected: coreOnShareSelected,
      actions: bulkOperations.actions,
    }),
    [
      coreSelectedIds,
      coreIsSelectionModeActive,
      coreOnLongPressItem,
      coreToggleSelection,
      coreSelectAll,
      coreClearItems,
      coreExitSelectionMode,
      coreOnShareSelected,
      bulkOperations.actions,
    ],
  );

  const periodBar = useMemo(
    (): JournalPeriodBarBundle => ({
      range: dateRange,
      onPress: showDatePicker,
      onPrevious: navigatePrevious,
      onNext: navigateNext,
    }),
    [dateRange, showDatePicker, navigatePrevious, navigateNext],
  );

  return {
    list,
    datePicker,
    selection,
    periodBar,
    modals,
    isSelectionModeActive: core.isSelectionModeActive,
    exitSelectionMode: core.exitSelectionMode,
  };
}
