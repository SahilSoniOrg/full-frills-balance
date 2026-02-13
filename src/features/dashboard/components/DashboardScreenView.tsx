import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function DashboardScreenView({
    isInitialized,
    hasCompletedOnboarding,
    listViewProps,
    headerProps,
    fab,
}: DashboardViewModel) {
    const { strings } = AppConfig;
    if (!isInitialized) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" />
                <AppText variant="body" color="secondary" style={{ marginTop: Spacing.md }}>
                    {strings.common.loading}
                </AppText>
            </View>
        );
    }

    if (!hasCompletedOnboarding) {
        return null;
    }

    return (
        <JournalListView
            {...listViewProps}
            showBack={false}
            listHeader={<DashboardHeader {...headerProps} />}
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
