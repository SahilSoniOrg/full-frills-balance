import { AppCard, AppText } from '@/components/core';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { AuditAction } from '@/src/data/models/AuditLog';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditService } from '@/src/services/audit-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AuditLogEntry {
    id: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    changes: string;
    timestamp: number;
}

interface ParsedChanges {
    before?: Record<string, any>;
    after?: Record<string, any>;
    [key: string]: any;
}

export default function AuditLogScreen() {
    const { theme } = useTheme();
    const { entityType, entityId } = useLocalSearchParams<{ entityType?: string; entityId?: string }>();

    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [accountMap, setAccountMap] = useState<Record<string, { name: string; currency: string }>>({});

    const isFiltered = !!(entityType && entityId);

    useEffect(() => {
        loadLogs();
        loadAccountMap();
    }, [entityType, entityId]);

    const loadAccountMap = async () => {
        try {
            const allAccounts = await accountRepository.findAll();
            const map: Record<string, { name: string; currency: string }> = {};
            allAccounts.forEach(acc => {
                map[acc.id] = { name: acc.name, currency: acc.currencyCode };
            });
            setAccountMap(map);
        } catch (error) {
            console.error('Failed to load account map:', error);
        }
    };

    const loadLogs = async () => {
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
            console.error('Failed to load audit logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

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

    const getActionColor = (action: AuditAction): string => {
        switch (action) {
            case AuditAction.CREATE:
                return theme.income;
            case AuditAction.UPDATE:
                return theme.transfer;
            case AuditAction.DELETE:
                return theme.expense;
            default:
                return theme.text;
        }
    };

    const getActionIcon = (action: AuditAction): keyof typeof Ionicons.glyphMap => {
        switch (action) {
            case AuditAction.CREATE:
                return 'add-circle-outline';
            case AuditAction.UPDATE:
                return 'pencil-outline';
            case AuditAction.DELETE:
                return 'trash-outline';
            default:
                return 'ellipse-outline';
        }
    };

    const formatTimestamp = (timestamp: number): string => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const parseChanges = (changes: string): ParsedChanges | null => {
        try {
            return JSON.parse(changes);
        } catch {
            return null;
        }
    };

    const renderChangeValue = (key: string, value: any, currencyCode?: string, isAfter: boolean = false, oppositeValue?: any): React.ReactNode => {
        if (value === null || value === undefined) return <AppText variant="caption">null</AppText>;

        // Format money fields
        if (['amount', 'totalAmount', 'totalDebits', 'totalCredits'].includes(key) && typeof value === 'number') {
            return <AppText variant="caption" color="secondary">{CurrencyFormatter.format(value, currencyCode)}</AppText>;
        }

        if (Array.isArray(value)) {
            return (
                <View style={styles.arrayContainer}>
                    {value.map((item, i) => {
                        // Check if it's a transaction-like object
                        if (typeof item === 'object' && item !== null && (item.accountName || item.accountId)) {
                            // Try to get name from snapshot, then from current map, then fallback
                            const accountInfo = accountMap[item.accountId] || { name: '', currency: '' };
                            const accountName = item.accountName || accountInfo.name || `Account ${item.accountId?.substring(0, 6)}`;
                            const itemCurrency = item.currencyCode || accountInfo.currency || currencyCode;

                            // Find corresponding item in opposite array for de-duplication
                            const oppositeArray = Array.isArray(oppositeValue) ? oppositeValue : [];
                            const oppositeItem = oppositeArray.find((opp: any) => opp.accountId === item.accountId);
                            const oppositeInfo = oppositeItem ? (accountMap[oppositeItem.accountId] || { name: '', currency: '' }) : null;
                            const oppositeName = oppositeItem ? (oppositeItem.accountName || oppositeInfo?.name || `Account ${oppositeItem.accountId?.substring(0, 6)}`) : null;

                            const nameChanged = !oppositeItem || oppositeName !== accountName;

                            // If this is the 'after' side and name hasn't changed, hide it
                            const shouldShowName = !isAfter || nameChanged;

                            return (
                                <View key={i} style={styles.arrayItem}>
                                    {shouldShowName && (
                                        <AppText variant="caption" color="secondary" weight="semibold">
                                            • {accountName}
                                        </AppText>
                                    )}
                                    <View style={shouldShowName ? { marginLeft: 12 } : {}}>
                                        <AppText variant="caption" color="secondary">
                                            {CurrencyFormatter.format(item.amount, itemCurrency)} ({item.type})
                                        </AppText>
                                    </View>
                                </View>
                            );
                        }
                        return (
                            <View key={i} style={styles.arrayItem}>
                                <AppText variant="caption" color="secondary">• {JSON.stringify(item)}</AppText>
                            </View>
                        );
                    })}
                </View>
            );
        }

        if (typeof value === 'object') {
            return (
                <View style={styles.nestedObject}>
                    {Object.entries(value).map(([k, v]) => (
                        <AppText key={k} variant="caption" color="secondary">
                            {k}: {typeof v === 'object' ? '[Object]' : String(v)}
                        </AppText>
                    ))}
                </View>
            );
        }

        return <AppText variant="caption" color="secondary">{String(value)}</AppText>;
    };

    const renderChanges = (changes: ParsedChanges) => {
        if (changes.before && changes.after) {
            // Before/After comparison
            const allKeys = Array.from(new Set([...Object.keys(changes.before), ...Object.keys(changes.after)]));

            const beforeCurrency = (changes.before as any).currencyCode;
            const afterCurrency = (changes.after as any).currencyCode;

            return (
                <View style={styles.changesContainer}>
                    {allKeys.map(key => {
                        const beforeVal = (changes.before as any)[key];
                        const afterVal = (changes.after as any)[key];
                        const isChanged = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);

                        if (!isChanged && key !== 'transactions') return null;
                        if (key === 'currencyCode') return null;

                        const isFinancial = ['amount', 'totalAmount', 'totalDebits', 'totalCredits'].includes(key);

                        if (isFinancial) {
                            const bNum = typeof beforeVal === 'number' ? beforeVal : parseFloat(String(beforeVal));
                            const aNum = typeof afterVal === 'number' ? afterVal : parseFloat(String(afterVal));

                            if (!isNaN(bNum) && !isNaN(aNum)) {
                                const diff = aNum - bNum;
                                const currency = afterCurrency || beforeCurrency;
                                const color = diff > 0 ? theme.success : diff < 0 ? theme.error : theme.textSecondary;
                                const diffPrefix = diff > 0 ? '+' : '';

                                return (
                                    <View key={key} style={styles.changeRow}>
                                        <AppText variant="caption" weight="bold">{key}:</AppText>
                                        <View style={styles.financialDiffRow}>
                                            <AppText variant="caption" color="secondary">{CurrencyFormatter.format(bNum, currency)}</AppText>
                                            <AppText variant="caption" style={styles.diffMarker}>:</AppText>
                                            <AppText variant="caption" style={[styles.diffValue, { color }]}>{diffPrefix}{CurrencyFormatter.format(diff, currency)}</AppText>
                                            <AppText variant="caption" style={styles.diffMarker}>:</AppText>
                                            <AppText variant="caption" color="secondary">{CurrencyFormatter.format(aNum, currency)}</AppText>
                                        </View>
                                    </View>
                                );
                            }
                        }

                        if (key === 'transactions' && Array.isArray(beforeVal) && Array.isArray(afterVal)) {
                            // Extract all account IDs involved
                            const accountIds = Array.from(new Set([
                                ...beforeVal.map(t => t.accountId),
                                ...afterVal.map(t => t.accountId)
                            ]));

                            return (
                                <View key={key} style={styles.changeRow}>
                                    <AppText variant="caption" weight="bold">transactions:</AppText>
                                    <View style={styles.arrayContainer}>
                                        {accountIds.map(accountId => {
                                            const tBefore = beforeVal.find(t => t.accountId === accountId);
                                            const tAfter = afterVal.find(t => t.accountId === accountId);

                                            const accInfo = accountMap[accountId] || { name: '', currency: '' };
                                            const name = (tAfter?.accountName || tBefore?.accountName || accInfo.name || `Account ${accountId.substring(0, 6)}`);
                                            const currency = tAfter?.currencyCode || tBefore?.currencyCode || accInfo.currency;

                                            const beforeAmt = tBefore?.amount || 0;
                                            const afterAmt = tAfter?.amount || 0;
                                            const diff = afterAmt - beforeAmt;

                                            if (diff === 0 && tBefore && tAfter) return null; // No change for this account

                                            const color = diff > 0 ? theme.success : diff < 0 ? theme.error : theme.textSecondary;
                                            const diffPrefix = diff > 0 ? '+' : '';

                                            return (
                                                <View key={accountId} style={styles.arrayItem}>
                                                    <AppText variant="caption" color="secondary" weight="semibold">• {name}</AppText>
                                                    <View style={[styles.financialDiffRow, { marginLeft: 12 }]}>
                                                        <AppText variant="caption" color="secondary" style={{ fontSize: 10, opacity: 0.6 }}>{CurrencyFormatter.format(beforeAmt, currency)}</AppText>
                                                        <AppText variant="caption" style={[styles.diffMarker, { fontSize: 10 }]}>:</AppText>
                                                        <AppText variant="caption" style={[styles.diffValue, { color, fontSize: 11 }]}>{diffPrefix}{CurrencyFormatter.format(diff, currency)}</AppText>
                                                        <AppText variant="caption" style={[styles.diffMarker, { fontSize: 10 }]}>:</AppText>
                                                        <AppText variant="caption" color="secondary" style={{ fontSize: 10, opacity: 0.9 }}>{CurrencyFormatter.format(afterAmt, currency)}</AppText>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        }

                        return (
                            <View key={key} style={styles.changeRow}>
                                <AppText variant="caption" weight="bold">{key}:</AppText>
                                <View style={styles.comparisonRow}>
                                    <View style={styles.beforeCol}>
                                        {renderChangeValue(key, beforeVal, beforeCurrency, false, afterVal)}
                                    </View>
                                    <View style={styles.arrowCol}>
                                        <Ionicons name="arrow-forward" size={12} color={theme.textTertiary} />
                                    </View>
                                    <View style={styles.afterCol}>
                                        {renderChangeValue(key, afterVal, afterCurrency, true, beforeVal)}
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            );
        }

        // Simple key-value changes
        return (
            <View style={styles.changesContainer}>
                {Object.entries(changes).map(([key, value]) => (
                    <View key={key} style={styles.simpleChangeRow}>
                        <AppText variant="caption" weight="bold">{key}: </AppText>
                        {renderChangeValue(key, value)}
                    </View>
                ))}
            </View>
        );
    };

    const renderItem = ({ item }: { item: AuditLogEntry }) => {
        const isExpanded = expandedIds.has(item.id);
        const parsedChanges = parseChanges(item.changes);
        const actionColor = getActionColor(item.action);

        return (
            <AppCard style={styles.card} padding="md" elevation="sm">
                <TouchableOpacity onPress={() => toggleExpanded(item.id)}>
                    <View style={styles.row}>
                        <View style={[styles.iconContainer, { backgroundColor: actionColor + '20' }]}>
                            <Ionicons name={getActionIcon(item.action)} size={20} color={actionColor} />
                        </View>
                        <View style={styles.content}>
                            <View style={styles.headerRow}>
                                <AppText variant="body" weight="semibold">
                                    {item.entityType.charAt(0).toUpperCase() + item.entityType.slice(1)}
                                </AppText>
                                <AppText variant="caption" style={{ color: actionColor }}>
                                    {item.action}
                                </AppText>
                            </View>
                            <AppText variant="caption" color="secondary">
                                {formatTimestamp(item.timestamp)}
                            </AppText>
                            <AppText variant="caption" color="secondary" numberOfLines={1}>
                                ID: {item.entityId.substring(0, 12)}...
                            </AppText>
                        </View>
                        <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={theme.textSecondary}
                        />
                    </View>
                    {isExpanded && parsedChanges && renderChanges(parsedChanges)}
                </TouchableOpacity>
            </AppCard>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Custom Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[styles.circularButton, { backgroundColor: theme.surface }]}
                >
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <AppText variant="subheading" style={styles.headerTitle}>
                    {isFiltered ? 'Edit History' : 'Audit Log'}
                </AppText>
                <View style={styles.placeholder} />
            </View>

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
                        renderItem={renderItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    circularButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholder: {
        width: 40,
    },
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
        padding: Spacing.lg,
        gap: Spacing.md,
    },
    card: {
        marginBottom: Spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        gap: Spacing.xs / 2,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    changesContainer: {
        marginTop: Spacing.md,
        padding: Spacing.sm,
        borderRadius: 8,
        backgroundColor: 'rgba(128, 128, 128, 0.05)',
    },
    changeRow: {
        marginBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(128, 128, 128, 0.1)',
        paddingBottom: Spacing.xs,
    },
    simpleChangeRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: Spacing.xs,
    },
    comparisonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 4,
        gap: 8,
    },
    beforeCol: {
        flex: 1,
        opacity: 0.6,
    },
    afterCol: {
        flex: 1,
    },
    arrowCol: {
        justifyContent: 'center',
        paddingTop: 4,
    },
    arrayContainer: {
        marginTop: 4,
    },
    arrayItem: {
        marginBottom: 2,
    },
    nestedObject: {
        padding: 4,
        backgroundColor: 'rgba(128, 128, 128, 0.05)',
        borderRadius: 4,
    },
    financialDiffRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    diffValue: {
        fontWeight: 'bold',
    },
    diffMarker: {
        marginHorizontal: 8,
        opacity: 0.3,
    },
});
