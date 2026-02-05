import { AppText } from '@/src/components/core';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { Spacing } from '@/src/constants';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function DashboardScreenView({
    isInitialized,
    hasCompletedOnboarding,
    list,
    headerProps,
    fab,
}: DashboardViewModel) {
    if (!isInitialized) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" />
                <AppText variant="body" style={styles.loadingText}>
                    Loading...
                </AppText>
            </View>
        );
    }

    if (!hasCompletedOnboarding) {
        return null;
    }

    return (
        <JournalListView
            showBack={false}
            listHeader={<DashboardHeader {...headerProps} />}
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
            fab={fab}
        />
    );
}

const styles = StyleSheet.create({
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    loadingText: {
        marginTop: Spacing.sm,
    },
});
