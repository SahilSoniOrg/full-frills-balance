import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { ExpandableSearchButton } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalListScreen } from '@/src/features/journal/hooks/useJournalListScreen';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';

export default function JournalScreen() {
    const { listViewProps, vm } = useJournalListScreen({
        pageSize: AppConfig.pagination.dashboardPageSize,
        emptyState: {
            title: AppConfig.strings.journal.emptyTitle,
            subtitle: AppConfig.strings.journal.emptySubtitle,
        },
        loadingText: AppConfig.strings.common.loading,
        loadingMoreText: AppConfig.strings.common.loading,
    });

    const handleFabPress = useCallback(() => {
        AppNavigation.toJournalEntry();
    }, []);

    const listHeader = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <ExpandableSearchButton
                value={vm.searchQuery}
                onChangeText={vm.onSearchChange}
            />
            {vm.searchQuery.length === 0 && (
                <DateRangeFilter
                    range={vm.dateRange}
                    onPress={vm.showDatePicker}
                    onPrevious={vm.navigatePrevious}
                    onNext={vm.navigateNext}
                    showNavigationArrows={false}
                />
            )}
        </View>
    ), [vm.searchQuery, vm.dateRange, vm.showDatePicker, vm.navigatePrevious, vm.navigateNext, vm.onSearchChange]);

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
