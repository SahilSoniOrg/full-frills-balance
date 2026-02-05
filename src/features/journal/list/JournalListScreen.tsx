import { JournalListHeader } from '@/src/features/journal/components/JournalListHeader';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalListViewModel } from '@/src/features/journal/hooks/useJournalListViewModel';
import React from 'react';

export function JournalListScreen() {
    const list = useJournalListViewModel({
        pageSize: 50,
        emptyState: {
            title: 'No transactions found',
            subtitle: 'Try adjusting your search or date filter'
        }
    });

    const headerTitle = list.searchQuery ? 'Search Results' : 'Transactions';

    return (
        <JournalListView
            screenTitle="Transactions"
            listHeader={(
                <JournalListHeader
                    title={headerTitle}
                    dateRange={list.dateRange}
                    onShowDatePicker={list.showDatePicker}
                    onNavigatePrevious={list.navigatePrevious}
                    onNavigateNext={list.navigateNext}
                    searchQuery={list.searchQuery}
                    onSearchChange={list.onSearchChange}
                />
            )}
            items={list.items}
            isLoading={list.isLoading}
            isLoadingMore={list.isLoadingMore}
            loadingText={list.loadingText}
            loadingMoreText={list.loadingMoreText}
            emptyTitle={list.emptyState.title}
            emptySubtitle={list.emptyState.subtitle}
            onEndReached={list.onEndReached}
            datePicker={{
                visible: list.isDatePickerVisible,
                onClose: list.hideDatePicker,
                currentFilter: list.periodFilter,
                onSelect: list.onDateSelect,
            }}
        />
    );
}
