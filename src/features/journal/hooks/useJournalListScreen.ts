import { EnrichedJournal, WorkplaceId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';
import { mapJournalToCardProps } from '../utils/journalUiUtils';
import { useJournalListViewModel } from './useJournalListViewModel';

/**
 * Helper hook that encapsulates the common pattern of using JournalListViewModel
 * and mapping its props to JournalListView component.
 *
 * Eliminates duplication between Dashboard and Journal screens.
 */
export function useJournalListScreen(
  config: Parameters<typeof useJournalListViewModel>[0],
  workplaceId: WorkplaceId,
) {
  const vm = useJournalListViewModel(config, workplaceId);

  const onPlannedJournalPress = useCallback((item: EnrichedJournal) => {
    if (item.plannedPaymentId) {
      AppNavigation.toPlannedPaymentDetails(item.plannedPaymentId);
    } else {
      const cardProps = mapJournalToCardProps(item);
      AppNavigation.toTransactionDetails(item.id, {
        title: cardProps.title,
        amount: cardProps.amount,
        currencyCode: cardProps.currencyCode,
        date:
          typeof cardProps.transactionDate === 'number'
            ? cardProps.transactionDate
            : (cardProps.transactionDate as Date).getTime(),
        typeColor: cardProps.presentation.typeColor,
        typeIcon: cardProps.presentation.typeIcon,
        displayType: item.displayType,
      });
    }
  }, []);

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
      plannedJournals: vm.plannedJournals,
      onPlannedJournalPress,
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
      vm.plannedJournals,
      onPlannedJournalPress,
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
