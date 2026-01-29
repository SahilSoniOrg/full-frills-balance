import { AppCard, AppIcon, AppText, IconName } from '@/src/components/core'
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants'
import { AuditAction } from '@/src/data/models/AuditLog'
import { useTheme } from '@/src/hooks/use-theme'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import { formatDate } from '@/src/utils/dateUtils'
import React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'

export interface AuditLogEntry {
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

interface AuditLogItemProps {
    item: AuditLogEntry;
    isExpanded: boolean;
    onToggle: () => void;
    accountMap: Record<string, { name: string; currency: string }>;
}

export const AuditLogItem = ({ item, isExpanded, onToggle, accountMap }: AuditLogItemProps) => {
    const { theme } = useTheme();

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

    const getActionIcon = (action: AuditAction): IconName => {
        switch (action) {
            case AuditAction.CREATE:
                return 'plusCircle';
            case AuditAction.UPDATE:
                return 'edit';
            case AuditAction.DELETE:
                return 'delete';
            default:
                return 'circle';
        }
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
                    {value.map((val, i) => {
                        // Check if it's a transaction-like object
                        if (typeof val === 'object' && val !== null && (val.accountName || val.accountId)) {
                            const accountInfo = accountMap[val.accountId] || { name: '', currency: '' };
                            const accountName = val.accountName || accountInfo.name || `Account ${val.accountId?.substring(0, 6)}`;
                            const itemCurrency = val.currencyCode || accountInfo.currency || currencyCode;

                            // Find corresponding item in opposite array for de-duplication
                            const oppositeArray = Array.isArray(oppositeValue) ? oppositeValue : [];
                            const oppositeItem = oppositeArray.find((opp: any) => opp.accountId === val.accountId);
                            const oppositeInfo = oppositeItem ? (accountMap[oppositeItem.accountId] || { name: '', currency: '' }) : null;
                            const oppositeName = oppositeItem ? (oppositeItem.accountName || oppositeInfo?.name || `Account ${oppositeItem.accountId?.substring(0, 6)}`) : null;

                            const nameChanged = !oppositeItem || oppositeName !== accountName;
                            const shouldShowName = !isAfter || nameChanged;

                            return (
                                <View key={i} style={styles.arrayItem}>
                                    {shouldShowName && (
                                        <AppText variant="caption" color="secondary" weight="semibold">
                                            • {accountName}
                                        </AppText>
                                    )}
                                    <View style={shouldShowName ? { marginLeft: Spacing.md } : {}}>
                                        <AppText variant="caption" color="secondary">
                                            {CurrencyFormatter.format(val.amount, itemCurrency)} ({val.type})
                                        </AppText>
                                    </View>
                                </View>
                            );
                        }
                        return (
                            <View key={i} style={styles.arrayItem}>
                                <AppText variant="caption" color="secondary">• {JSON.stringify(val)}</AppText>
                            </View>
                        );
                    })}
                </View>
            );
        }

        if (typeof value === 'object') {
            return (
                <View style={[styles.nestedObject, { backgroundColor: theme.surfaceSecondary }]}>
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
            const allKeys = Array.from(new Set([...Object.keys(changes.before), ...Object.keys(changes.after)]));
            const beforeCurrency = (changes.before as any).currencyCode;
            const afterCurrency = (changes.after as any).currencyCode;

            return (
                <View style={[styles.changesContainer, { backgroundColor: theme.surfaceSecondary }]}>
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
                                    <View key={key} style={[styles.changeRow, { borderBottomColor: theme.divider }]}>
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
                                            const beforeType = tBefore?.type || '';
                                            const afterType = tAfter?.type || '';

                                            const amountDiff = afterAmt - beforeAmt;
                                            const typeChanged = beforeType !== afterType;

                                            if (amountDiff === 0 && !typeChanged && tBefore && tAfter) return null;

                                            return (
                                                <View key={accountId} style={styles.arrayItem}>
                                                    <AppText variant="caption" color="secondary" weight="semibold">• {name}</AppText>
                                                    <View style={[styles.financialDiffRow, { marginLeft: Spacing.md }]}>
                                                        <AppText variant="caption" color="secondary" style={{ fontSize: Typography.sizes.xs, opacity: Opacity.medium }}>
                                                            {CurrencyFormatter.format(beforeAmt, currency)} ({beforeType})
                                                        </AppText>
                                                        <AppText variant="caption" style={[styles.diffMarker, { fontSize: Typography.sizes.xs }]}>→</AppText>
                                                        <AppText variant="caption" color="secondary" style={{ fontSize: Typography.sizes.xs, opacity: Opacity.heavy }}>
                                                            {CurrencyFormatter.format(afterAmt, currency)} ({afterType})
                                                        </AppText>
                                                        {typeChanged && (
                                                            <AppText variant="caption" style={{ color: theme.transfer, fontSize: Typography.sizes.xs, marginLeft: Spacing.xs }}>
                                                                (type changed)
                                                            </AppText>
                                                        )}
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
                                        <AppIcon name="arrowRight" size={12} color={theme.textTertiary} />
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

    const actionColor = getActionColor(item.action);
    const parsedChanges = parseChanges(item.changes);

    return (
        <AppCard style={styles.card} padding="md" elevation="sm">
            <TouchableOpacity onPress={onToggle}>
                <View style={styles.row}>
                    <View style={[styles.iconContainer, { backgroundColor: withOpacity(actionColor, Opacity.soft) }]}>
                        <AppIcon name={getActionIcon(item.action)} size={Size.sm} color={actionColor} />
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
                            {formatDate(item.timestamp, { includeTime: true })}
                        </AppText>
                        <AppText variant="caption" color="secondary" numberOfLines={1}>
                            ID: {item.entityId.substring(0, 12)}...
                        </AppText>
                    </View>
                    <AppIcon
                        name={isExpanded ? 'chevronUp' : 'chevronDown'}
                        size={Size.sm}
                        color={theme.textSecondary}
                    />
                </View>
                {isExpanded && parsedChanges && renderChanges(parsedChanges)}
            </TouchableOpacity>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    card: {
        marginBottom: Spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    iconContainer: {
        width: Size.xl,
        height: Size.xl,
        borderRadius: Shape.radius.full,
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
        borderRadius: Shape.radius.sm,
    },
    changeRow: {
        marginBottom: Spacing.sm,
        borderBottomWidth: 1,
    },
    simpleChangeRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: Spacing.xs,
    },
    comparisonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: Spacing.xs,
        gap: Spacing.sm,
    },
    beforeCol: {
        flex: 1,
        opacity: Opacity.medium,
    },
    afterCol: {
        flex: 1,
    },
    arrowCol: {
        justifyContent: 'center',
        paddingTop: Spacing.xs,
    },
    arrayContainer: {
        marginTop: Spacing.xs,
    },
    arrayItem: {
        marginBottom: Spacing.xs,
    },
    nestedObject: {
        padding: Spacing.xs,
        borderRadius: Shape.radius.xs,
    },
    financialDiffRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.xs,
    },
    diffValue: {
        fontWeight: 'bold',
    },
    diffMarker: {
        marginHorizontal: Spacing.sm,
        opacity: Opacity.soft,
    },
});
