import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { DashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { JournalListView, PlannedPaymentsSection } from '@/src/features/journal';

import { Inset, Page, Skeleton, Stack } from '@/src/design-system';
import React from 'react';
import { StyleSheet, View } from 'react-native';
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

    if (!isInitialized) {
        return (
            <Page edges={['top']}>
                <Inset space="lg">
                    <Stack gap="xl">
                        <Skeleton height={60} radius="lg" />
                        <Skeleton height={180} radius="xl" />
                        <Stack gap="md">
                            <Skeleton width={150} height={20} />
                            <Stack gap="sm">
                                {[1, 2, 3].map(i => (
                                    <Skeleton key={i} height={50} radius="lg" />
                                ))}
                            </Stack>
                        </Stack>
                    </Stack>
                </Inset>
            </Page>
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
                    <View style={{ zIndex: 10 }}>
                        <DashboardHeader
                            {...headerProps}
                        />
                        {safeToSpendData && (
                            <View style={{ zIndex: 10 }}>
                                <SafeToSpendCard
                                    {...safeToSpendData}
                                    isLoading={!isInitialized}
                                />
                            </View>
                        )}
                        <View style={{ zIndex: 1 }}>
                            <PlannedPaymentsSection
                                items={listViewProps.plannedJournals || []}
                                onItemPress={listViewProps.onPlannedJournalPress}
                            />
                        </View>
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
