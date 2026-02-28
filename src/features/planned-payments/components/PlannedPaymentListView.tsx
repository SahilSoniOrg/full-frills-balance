import { EmptyStateView, LoadingView } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { PlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import { usePlannedPayments } from '@/src/features/planned-payments/hooks/usePlannedPayments';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

export function PlannedPaymentListView() {
    const { items, isLoading } = usePlannedPayments();

    if (isLoading && items.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <LoadingView loading={true} text={AppConfig.strings.common.loading} />
            </View>
        );
    }

    return (
        <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
                <EmptyStateView
                    title={AppConfig.strings.plannedPayments.emptyTitle}
                    subtitle={AppConfig.strings.plannedPayments.emptySubtitle}
                    style={styles.emptyState}
                />
            }
            renderItem={({ item }) => (
                <PlannedPaymentCard
                    item={item}
                    onPress={() => AppNavigation.toPlannedPaymentDetails(item.id)}
                />
            )}
        />
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: Spacing.md,
        paddingBottom: 80,
    },
    emptyState: {
        marginTop: Spacing.xxxl,
    }
});
