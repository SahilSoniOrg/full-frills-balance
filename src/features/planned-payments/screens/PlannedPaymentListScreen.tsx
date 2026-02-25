import { EmptyStateView, LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { PlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import { usePlannedPayments } from '@/src/features/planned-payments/hooks/usePlannedPayments';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, StyleSheet, TouchableOpacity } from 'react-native';

export default function PlannedPaymentListScreen() {
    const { theme } = useTheme();
    const { items, isLoading } = usePlannedPayments();

    if (isLoading && items.length === 0) {
        return <LoadingView loading={true} text={AppConfig.strings.common.loading} />;
    }

    return (
        <Screen
            title={AppConfig.strings.journal.plannedPayments}
            showBack={true}
        >
            <FlatList
                data={items}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <EmptyStateView
                        title={AppConfig.strings.plannedPayments.emptyTitle}
                        subtitle={AppConfig.strings.plannedPayments.emptySubtitle}
                    />
                }
                renderItem={({ item }) => (
                    <PlannedPaymentCard
                        item={item}
                        onPress={() => AppNavigation.toPlannedPaymentDetails(item.id)}
                    />
                )}
            />

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: theme.primary }]}
                onPress={() => AppNavigation.toPlannedPaymentForm()}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={32} color={theme.onPrimary} />
            </TouchableOpacity>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        padding: Spacing.md,
        paddingBottom: 80,
    },
    fab: {
        position: 'absolute',
        right: Spacing.xl,
        bottom: Spacing.xl,
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
});
