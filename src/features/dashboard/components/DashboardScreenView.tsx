import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { JournalListView, PlannedPaymentsSection } from '@/src/features/journal';

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { InsightWidget } from './InsightWidget';
import { SafeToSpendCard } from './SafeToSpendCard';

export function DashboardScreenView({
    isInitialized,
    hasCompletedOnboarding,
    listViewProps,
    headerProps,
    fab,
    safeToSpendData,
    patterns,
    transactionSectionTitle,
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
            listHeader={
                <View>
                    <DashboardHeader {...headerProps} />
                    <PlannedPaymentsSection
                        items={listViewProps.plannedJournals || []}
                        onItemPress={listViewProps.onPlannedJournalPress}
                    />
                    {safeToSpendData && (
                        <SafeToSpendCard
                            {...safeToSpendData}
                            isLoading={!isInitialized}
                        />
                    )}
                    <InsightWidget patterns={patterns} />
                    <AppText variant="subheading" color="secondary" style={styles.transactionSectionTitle}>
                        {transactionSectionTitle}
                    </AppText>
                </View>
            }
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
    transactionSectionTitle: {
        marginTop: Spacing.sm,
        marginBottom: Spacing.md,
    },
});
