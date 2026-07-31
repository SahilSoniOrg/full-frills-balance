import {
  type JournalDatePickerBundle,
  type JournalListBundle,
  type JournalSelectionBundle,
} from '@/src/features/journal/components/JournalListView';
import { WorkplaceId } from '@/src/types/domain';
import { useMemo } from 'react';
import { useJournalListViewModel } from './useJournalListViewModel';

export type JournalListRenderBundle = {
  list: Omit<JournalListBundle, 'listHeader' | 'listContentStyle'>;
  datePicker: JournalDatePickerBundle;
  selection: JournalSelectionBundle;
};

/**
 * Helper hook that encapsulates the common pattern of using JournalListViewModel
 * and mapping its props to JournalListView component.
 */
export function useJournalListScreen(
  config: Parameters<typeof useJournalListViewModel>[0],
  workplaceId: WorkplaceId,
) {
  const vm = useJournalListViewModel(config, workplaceId);

  const list = useMemo(
    (): JournalListRenderBundle['list'] => ({
      items: vm.items,
      isLoading: vm.isLoading,
      isLoadingMore: vm.isLoadingMore,
      loadingText: vm.loadingText,
      loadingMoreText: vm.loadingMoreText,
      emptyTitle: vm.emptyState.title,
      emptySubtitle: vm.emptyState.subtitle,
      onEndReached: vm.onEndReached,
    }),
    [
      vm.items,
      vm.isLoading,
      vm.isLoadingMore,
      vm.loadingText,
      vm.loadingMoreText,
      vm.emptyState.title,
      vm.emptyState.subtitle,
      vm.onEndReached,
    ],
  );

  const datePicker = useMemo(
    (): JournalDatePickerBundle => ({
      visible: vm.isDatePickerVisible,
      onClose: vm.hideDatePicker,
      currentFilter: vm.periodFilter,
      onSelect: vm.onDateSelect,
    }),
    [vm.isDatePickerVisible, vm.hideDatePicker, vm.periodFilter, vm.onDateSelect],
  );

  const selection = useMemo(
    (): JournalSelectionBundle => ({
      selectedIds: vm.selectedIds,
      isSelectionModeActive: vm.isSelectionModeActive,
      onLongPressItem: vm.onLongPressItem,
      toggleSelection: vm.toggleSelection,
      selectAll: vm.selectAll,
      clearItems: vm.clearItems,
      exitSelectionMode: vm.exitSelectionMode,
      onShareSelected: vm.onShareSelected,
    }),
    [
      vm.selectedIds,
      vm.isSelectionModeActive,
      vm.onLongPressItem,
      vm.toggleSelection,
      vm.selectAll,
      vm.clearItems,
      vm.exitSelectionMode,
      vm.onShareSelected,
    ],
  );

  const render = useMemo(
    (): JournalListRenderBundle => ({ list, datePicker, selection }),
    [list, datePicker, selection],
  );

  return {
    render,
    list,
    datePicker,
    selection,
    vm,
  };
}
