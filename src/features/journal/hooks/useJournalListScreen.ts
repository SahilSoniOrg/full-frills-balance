import { WorkplaceId } from '@/src/types/domain';
import { useMemo } from 'react';
import { useJournalListViewModel } from './useJournalListViewModel';

/**
 * Helper hook that encapsulates the common pattern of using JournalListViewModel
 * and mapping its props to JournalListView component.
 */
export function useJournalListScreen(
  config: Parameters<typeof useJournalListViewModel>[0],
  workplaceId: WorkplaceId,
) {
  const vm = useJournalListViewModel(config, workplaceId);

  const listViewProps = useMemo(
    () => ({
      items: vm.items,
      isLoading: vm.isLoading,
      isLoadingMore: vm.isLoadingMore,
      loadingText: vm.loadingText,
      loadingMoreText: vm.loadingMoreText,
      emptyTitle: vm.emptyState.title,
      emptySubtitle: vm.emptyState.subtitle,
      onEndReached: vm.onEndReached,
      datePicker: {
        visible: vm.isDatePickerVisible,
        onClose: vm.hideDatePicker,
        currentFilter: vm.periodFilter,
        onSelect: vm.onDateSelect,
      },
      selection: {
        selectedIds: vm.selectedIds,
        isSelectionModeActive: vm.isSelectionModeActive,
        onLongPressItem: vm.onLongPressItem,
        toggleSelection: vm.toggleSelection,
        selectAll: vm.selectAll,
        clearItems: vm.clearItems,
        exitSelectionMode: vm.exitSelectionMode,
        onShareSelected: vm.onShareSelected,
      },
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
      vm.isDatePickerVisible,
      vm.hideDatePicker,
      vm.periodFilter,
      vm.onDateSelect,
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

  return {
    listViewProps,
    vm,
  };
}
