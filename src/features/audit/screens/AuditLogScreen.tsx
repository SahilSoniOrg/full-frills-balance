import { AppIcon, AppText } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { Spacing } from '@/src/constants'
import { AuditLogItem } from '@/src/features/audit/components/AuditLogItem'
import { useAuditAccounts } from '@/src/features/audit/hooks/useAuditData'
import { useAuditLogs } from '@/src/features/audit/hooks/useAuditLogs'
import { useTheme } from '@/src/hooks/use-theme'
import { useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'

export default function AuditLogScreen() {
    const { theme } = useTheme();
    const { entityType, entityId } = useLocalSearchParams<{ entityType?: string; entityId?: string }>();

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const { accountMap, isLoading: accountsLoading } = useAuditAccounts();
    const { logs, isLoading } = useAuditLogs({ entityType, entityId });

    const isFiltered = !!entityId;

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <Screen
            title={isFiltered ? 'Edit History' : 'Audit Log'}
        >
            <View style={styles.viewContent}>
                {(isLoading || accountsLoading) ? (
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
                                onToggle={() => toggleExpanded(item.id)}
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
