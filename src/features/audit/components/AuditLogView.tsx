import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { AuditLogItem } from '@/src/features/audit/components/AuditLogItem';
import { AuditLogViewModel } from '@/src/features/audit/hooks/useAuditLogViewModel';
import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

export function AuditLogView(vm: AuditLogViewModel) {
    const {
        theme,
        logs,
        accountMap,
        isLoading,
        isFiltered,
        expandedIds,
        onToggleExpanded,
    } = vm;

    return (
        <Screen
            title={isFiltered ? 'Edit History' : 'Audit Log'}
        >
            <View style={styles.viewContent}>
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={theme.primary} />
                    </View>
                ) : logs.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <AppIcon name="document" size={64} color={theme.textSecondary} />
                        <AppText variant="body" color="secondary" style={styles.emptyText}>
                            No audit logs found
                        </AppText>
                    </View>
                ) : (
                    <FlatList
                        data={logs}
                        renderItem={({ item }) => (
                            <AuditLogItem
                                item={item}
                                isExpanded={expandedIds.has(item.id)}
                                onToggle={() => onToggleExpanded(item.id)}
                                accountMap={accountMap}
                            />
                        )}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    viewContent: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.md,
    },
    emptyText: {
        marginTop: Spacing.sm,
    },
    list: {
        padding: Spacing.md,
    },
});
