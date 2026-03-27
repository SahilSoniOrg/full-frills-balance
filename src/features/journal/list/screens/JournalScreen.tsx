import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { IconButton } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useJournalListScreen } from '@/src/features/journal/hooks/useJournalListScreen';
import { useJournalRouteDateRange } from '@/src/features/journal/list/hooks/useJournalRouteDateRange';
import { AppNavigation } from '@/src/utils/navigation';
import { router } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export default function JournalScreen() {
    const initialDateRange = useJournalRouteDateRange();
    const canGoBack = router.canGoBack();

    const { listViewProps, vm } = useJournalListScreen({
        pageSize: AppConfig.pagination.dashboardPageSize,
        emptyState: {
            title: AppConfig.strings.journal.emptyTitle,
            subtitle: AppConfig.strings.journal.emptySubtitle,
        },
        loadingText: AppConfig.strings.common.loading,
        loadingMoreText: AppConfig.strings.common.loading,
        initialDateRange: initialDateRange ?? null,
    });

    const handleFabPress = useCallback(() => {
        AppNavigation.toJournalEntry();
    }, []);

    const headerActions = useMemo(() => (
        <View style={styles.headerActions}>
            {Platform.OS === 'android' && (
                <IconButton
                    name="messageCircle"
                    size={Size.iconSm}
                    variant="surface"
                    onPress={AppNavigation.toSmsInbox}
                    accessibilityLabel="Import SMS"
                />
            )}
            <IconButton
                name="reports"
                size={Size.iconSm}
                variant="surface"
                onPress={AppNavigation.toReports}
                accessibilityLabel="View Analytics"
            />
            <IconButton
                name="search"
                size={Size.iconSm}
                variant="surface"
                onPress={() => AppNavigation.toJournalSearch()}
                accessibilityLabel="Search and Filter"
            />
            <DateRangeFilter
                range={vm.dateRange}
                onPress={vm.showDatePicker}
                onPrevious={vm.navigatePrevious}
                onNext={vm.navigateNext}
                showNavigationArrows={false}
            />
        </View>
    ), [vm.dateRange, vm.showDatePicker, vm.navigatePrevious, vm.navigateNext]);

    const fab = useMemo(() => ({ onPress: handleFabPress }), [handleFabPress]);

    return (
        <JournalListView
            {...listViewProps}
            screenTitle={AppConfig.strings.journal.transactions}
            headerActions={headerActions}
            listHeader={null}
            fab={fab}
            plannedJournals={vm.plannedJournals}
            onPlannedJournalPress={listViewProps.onPlannedJournalPress}
            showBack={canGoBack}
            isSearchActive={false}
            alignTitle={canGoBack ? 'center' : 'left'}
        />
    );
}

const styles = StyleSheet.create({
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    }
});
