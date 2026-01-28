import { AppText } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { Spacing } from '@/src/constants'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { AuditLogItem, type AuditLogEntry } from '@/src/features/audit/components/AuditLogItem'
import { useTheme } from '@/src/hooks/use-theme'
import { auditService } from '@/src/services/audit-service'
import { logger } from '@/src/utils/logger'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'

export default function AuditLogScreen() {
    const { theme } = useTheme();
    const { entityType, entityId } = useLocalSearchParams<{ entityType?: string; entityId?: string }>();

    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [accountMap, setAccountMap] = useState<Record<string, { name: string; currency: string }>>({});

    const isFiltered = !!(entityType && entityId);

    const loadAccountMap = React.useCallback(async () => {
        try {
            const allAccounts = await accountRepository.findAll();
            const map: Record<string, { name: string; currency: string }> = {};
            allAccounts.forEach(acc => {
                map[acc.id] = { name: acc.name, currency: acc.currencyCode };
            });
            setAccountMap(map);
        } catch (error) {
            logger.error('Failed to load account map:', error);
        }
    }, []);

    const loadLogs = React.useCallback(async () => {
        setIsLoading(true);
        try {
            let fetchedLogs;
            if (isFiltered) {
                fetchedLogs = await auditService.getAuditTrail(entityType!, entityId!);
            } else {
                fetchedLogs = await auditService.getRecentLogs(200);
            }
            setLogs(fetchedLogs.map(log => ({
                id: log.id,
                entityType: log.entityType,
                entityId: log.entityId,
                action: log.action,
                changes: log.changes,
                timestamp: log.timestamp,
            })));
        } catch (error) {
            logger.error('Failed to load audit logs:', error);
        } finally {
            setIsLoading(false);
        }
    }, [entityType, entityId, isFiltered]);

    useEffect(() => {
        loadLogs();
        loadAccountMap();
    }, [loadLogs, loadAccountMap]);

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
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={theme.primary} />
                    </View>
                ) : logs.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="document-text-outline" size={64} color={theme.textSecondary} />
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
