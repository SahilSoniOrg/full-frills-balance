import { AppNavigation } from '@/src/utils/navigation';
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
            plannedJournals: vm.plannedJournals,
            onPlannedJournalPress: (item: any) => {
                // If it's a planned payment, we should ideally go to its details
                // or ensure toTransactionDetails supports it. 
                // Given the review feedback, let's route to Planned Payment details for the rule
                // or fix TransactionDetails to show planned journals.
                // The review says: "either route planned items to planned-payment details screen, or add a query path for transaction details that includes PLANNED"
                if (item.plannedPaymentId) {
                    AppNavigation.toPlannedPaymentDetails(item.plannedPaymentId);
                } else {
                    AppNavigation.toTransactionDetails(item.id);
                }
            },
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
