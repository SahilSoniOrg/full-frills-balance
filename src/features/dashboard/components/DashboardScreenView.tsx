import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { JournalListView, PlannedPaymentsSection } from '@/src/features/journal';

import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeToSpendCard } from './SafeToSpendCard';

export function DashboardScreenView({
    isInitialized,
    hasCompletedOnboarding,
    listViewProps,
    headerProps,
    fab,
    safeToSpendData,
    transactionSectionTitle,
    listRef,
}: DashboardViewModel & { listRef?: React.RefObject<any> }) {
    const { strings } = AppConfig;
    const router = useRouter();

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
        <>
            <JournalListView
                {...listViewProps}
                ref={listRef}
                showBack={false}
                listHeader={
                    <View>
                        <DashboardHeader
                            {...headerProps}
                            onInsightsPress={() => router.push('/insights')}
                        />
                        {safeToSpendData && (
                            <SafeToSpendCard
                                {...safeToSpendData}
                                isLoading={!isInitialized}
                            />
                        )}
                        <PlannedPaymentsSection
                            items={listViewProps.plannedJournals || []}
                            onItemPress={listViewProps.onPlannedJournalPress}
                        />
                        <AppText variant="subheading" color="secondary" style={styles.transactionSectionTitle}>
                            {transactionSectionTitle}
                        </AppText>
                    </View>
                }
                fab={fab}
            />
        </>
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
