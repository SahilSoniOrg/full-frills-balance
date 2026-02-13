import { useJournalListViewModel } from './useJournalListViewModel';

/**
 * Helper hook that encapsulates the common pattern of using JournalListViewModel
 * and mapping its props to JournalListView component.
 * 
 * Eliminates duplication between Dashboard and Journal screens.
 */
export function useJournalListScreen(config: Parameters<typeof useJournalListViewModel>[0]) {
    const vm = useJournalListViewModel(config);

    return {
        /**
         * Props ready to spread into JournalListView component
         */
        listViewProps: {
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
        },
        /**
         * Full view model for custom header needs
         */
        vm,
    };
}
