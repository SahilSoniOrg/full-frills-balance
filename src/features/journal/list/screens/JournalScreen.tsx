import { FilterToolbar } from '@/src/components/common/FilterToolbar';
import { AppConfig } from '@/src/constants';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalListScreen } from '@/src/features/journal/hooks/useJournalListScreen';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useCallback, useMemo } from 'react';

export default function JournalScreen() {
    const { listViewProps, vm } = useJournalListScreen({
        pageSize: AppConfig.pagination.dashboardPageSize,
        emptyState: {
            title: AppConfig.strings.journal.emptyTitle,
            subtitle: AppConfig.strings.journal.emptySubtitle
        },
        loadingText: AppConfig.strings.common.loading,
        loadingMoreText: AppConfig.strings.common.loading
    });

    const handleFabPress = useCallback(() => {
        AppNavigation.toJournalEntry();
    }, []);

    // Memoize listHeader to prevent re-renders when observables fire
    const listHeader = useMemo(() => (
        <FilterToolbar
            searchQuery={vm.searchQuery}
            onSearchChange={vm.onSearchChange}
            dateRange={vm.dateRange}
            showDatePicker={vm.showDatePicker}
            navigatePrevious={vm.navigatePrevious}
            navigateNext={vm.navigateNext}
            showNavigationArrows={false}
        />
    ), [vm.searchQuery, vm.dateRange, vm.showDatePicker, vm.navigatePrevious, vm.navigateNext, vm.onSearchChange]);

    // Memoize fab object to prevent re-renders
    const fab = useMemo(() => ({ onPress: handleFabPress }), [handleFabPress]);

    return (
        <JournalListView
            {...listViewProps}
            screenTitle={AppConfig.strings.journal.transactions}
            listHeader={listHeader}
            fab={fab}
        />
    );
}
