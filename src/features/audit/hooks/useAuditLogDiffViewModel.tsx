import { AppIcon, AppText, IconName } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { AuditAction } from '@/src/data/models/AuditLog';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

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

interface UseAuditLogDiffViewModelParams {
    item: AuditLogEntry;
    accountMap: Record<string, { name: string; currency: string }>;
}

const FINANCIAL_KEYS = ['amount', 'totalAmount', 'totalDebits', 'totalCredits'] as const;
const TRANSACTIONS_KEY = 'transactions';
const CURRENCY_CODE_KEY = 'currencyCode';
const AUDIT_ID_SHORT_LEN = 6;
const AUDIT_ID_PREVIEW_LEN = 12;

export function useAuditLogDiffViewModel({ item, accountMap }: UseAuditLogDiffViewModelParams) {
    const { theme } = useTheme();

    const actionColor = useMemo(() => {
        switch (item.action) {
            case AuditAction.CREATE:
                return theme.income;
            case AuditAction.UPDATE:
                return theme.transfer;
            case AuditAction.DELETE:
                return theme.expense;
            default:
                return theme.text;
        }
    }, [item.action, theme]);

    const actionIcon = useMemo<IconName>(() => {
        switch (item.action) {
            case AuditAction.CREATE:
                return 'plusCircle';
            case AuditAction.UPDATE:
                return 'edit';
            case AuditAction.DELETE:
                return 'delete';
            default:
                return 'circle';
        }
    }, [item.action]);

    const parsedChanges = useMemo<ParsedChanges | null>(() => {
        try {
            return JSON.parse(item.changes);
        } catch {
            return null;
        }
    }, [item.changes]);

    const renderChangeValue = (key: string, value: any, currencyCode?: string, isAfter = false, oppositeValue?: any): React.ReactNode => {
        if (value === null || value === undefined) return <AppText variant="caption">null</AppText>;

        if (FINANCIAL_KEYS.includes(key as (typeof FINANCIAL_KEYS)[number]) && typeof value === 'number') {
            return <AppText variant="caption" color="secondary">{CurrencyFormatter.format(value, currencyCode)}</AppText>;
        }

        if (Array.isArray(value)) {
            return (
                <View style={{ marginTop: Spacing.xs }}>
                    {value.map((val, index) => {
                        if (typeof val === 'object' && val !== null && (val.accountName || val.accountId)) {
                            const accountInfo = accountMap[val.accountId] || { name: '', currency: '' };
                            const accountName = val.accountName || accountInfo.name || `Account ${val.accountId?.substring(0, AUDIT_ID_SHORT_LEN)}`;
                            const itemCurrency = val.currencyCode || accountInfo.currency || currencyCode;

                            const oppositeArray = Array.isArray(oppositeValue) ? oppositeValue : [];
                            const oppositeItem = oppositeArray.find((opp: any) => opp.accountId === val.accountId);
                            const oppositeInfo = oppositeItem ? (accountMap[oppositeItem.accountId] || { name: '', currency: '' }) : null;
                            const oppositeName = oppositeItem
                                ? (oppositeItem.accountName || oppositeInfo?.name || `Account ${oppositeItem.accountId?.substring(0, AUDIT_ID_SHORT_LEN)}`)
                                : null;

                            const nameChanged = !oppositeItem || oppositeName !== accountName;
                            const shouldShowName = !isAfter || nameChanged;

                            return (
                                <View key={index} style={{ marginBottom: Spacing.xs }}>
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
                            <View key={index} style={{ marginBottom: Spacing.xs }}>
                                <AppText variant="caption" color="secondary">• {JSON.stringify(val)}</AppText>
                            </View>
                        );
                    })}
                </View>
            );
        }

        if (typeof value === 'object') {
            return (
                <View style={{ padding: Spacing.xs, borderRadius: Shape.radius.sm, backgroundColor: theme.surfaceSecondary }}>
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
                <View style={{ marginTop: Spacing.md, padding: Spacing.sm, borderRadius: Shape.radius.sm, backgroundColor: theme.surfaceSecondary }}>
                    {allKeys.map((key) => {
                        const beforeVal = (changes.before as any)[key];
                        const afterVal = (changes.after as any)[key];
                        const isChanged = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);

                        if (!isChanged && key !== TRANSACTIONS_KEY) return null;
                        if (key === CURRENCY_CODE_KEY) return null;

                        const isFinancial = FINANCIAL_KEYS.includes(key as (typeof FINANCIAL_KEYS)[number]);
                        if (isFinancial) {
                            const bNum = typeof beforeVal === 'number' ? beforeVal : parseFloat(String(beforeVal));
                            const aNum = typeof afterVal === 'number' ? afterVal : parseFloat(String(afterVal));

                            if (!isNaN(bNum) && !isNaN(aNum)) {
                                const diff = aNum - bNum;
                                const currency = afterCurrency || beforeCurrency;
                                const color = diff > 0 ? theme.success : diff < 0 ? theme.error : theme.textSecondary;
                                const diffPrefix = diff > 0 ? '+' : '';

                                return (
                                    <View key={key} style={{ marginBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }}>
                                        <AppText variant="caption" weight="bold">{key}:</AppText>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs }}>
                                            <AppText variant="caption" color="secondary">{CurrencyFormatter.format(bNum, currency)}</AppText>
                                            <AppText variant="caption" style={{ marginHorizontal: Spacing.sm, opacity: Opacity.soft }}>:</AppText>
                                            <AppText variant="caption" style={{ color, fontWeight: 'bold' }}>{diffPrefix}{CurrencyFormatter.format(diff, currency)}</AppText>
                                            <AppText variant="caption" style={{ marginHorizontal: Spacing.sm, opacity: Opacity.soft }}>:</AppText>
                                            <AppText variant="caption" color="secondary">{CurrencyFormatter.format(aNum, currency)}</AppText>
                                        </View>
                                    </View>
                                );
                            }
                        }

                        if (key === TRANSACTIONS_KEY && Array.isArray(beforeVal) && Array.isArray(afterVal)) {
                            const accountIds = Array.from(new Set([
                                ...beforeVal.map((t: any) => t.accountId),
                                ...afterVal.map((t: any) => t.accountId),
                            ]));

                            return (
                                <View key={key} style={{ marginBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }}>
                                    <AppText variant="caption" weight="bold">{AppConfig.strings.audit.transactionsLabel}</AppText>
                                    <View style={{ marginTop: Spacing.xs }}>
                                        {accountIds.map((accountId) => {
                                            const tBefore = beforeVal.find((t: any) => t.accountId === accountId);
                                            const tAfter = afterVal.find((t: any) => t.accountId === accountId);

                                            const accInfo = accountMap[accountId] || { name: '', currency: '' };
                                            const name = tAfter?.accountName || tBefore?.accountName || accInfo.name || `Account ${accountId.substring(0, AUDIT_ID_SHORT_LEN)}`;
                                            const currency = tAfter?.currencyCode || tBefore?.currencyCode || accInfo.currency;

                                            const beforeAmt = tBefore?.amount || 0;
                                            const afterAmt = tAfter?.amount || 0;
                                            const beforeType = tBefore?.type || '';
                                            const afterType = tAfter?.type || '';

                                            const amountDiff = afterAmt - beforeAmt;
                                            const typeChanged = beforeType !== afterType;

                                            if (amountDiff === 0 && !typeChanged && tBefore && tAfter) return null;

                                            return (
                                                <View key={accountId} style={{ marginBottom: Spacing.xs }}>
                                                    <AppText variant="caption" color="secondary" weight="semibold">• {name}</AppText>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: Spacing.md }}>
                                                        <AppText
                                                            variant="caption"
                                                            color="secondary"
                                                            style={{ fontSize: Typography.sizes.xs, opacity: Opacity.medium }}
                                                        >
                                                            {CurrencyFormatter.format(beforeAmt, currency)} ({beforeType})
                                                        </AppText>
                                                        <AppText variant="caption" style={{ marginHorizontal: Spacing.sm, fontSize: Typography.sizes.xs }}>→</AppText>
                                                        <AppText
                                                            variant="caption"
                                                            color="secondary"
                                                            style={{ fontSize: Typography.sizes.xs, opacity: Opacity.heavy }}
                                                        >
                                                            {CurrencyFormatter.format(afterAmt, currency)} ({afterType})
                                                        </AppText>
                                                        {typeChanged && (
                                                            <AppText
                                                                variant="caption"
                                                                style={{ color: theme.transfer, fontSize: Typography.sizes.xs, marginLeft: Spacing.xs }}
                                                            >
                                                                {AppConfig.strings.audit.typeChanged}
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
                            <View key={key} style={{ marginBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }}>
                                <AppText variant="caption" weight="bold">{key}:</AppText>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.xs, gap: Spacing.sm }}>
                                    <View style={{ flex: 1, opacity: Opacity.medium }}>
                                        {renderChangeValue(key, beforeVal, beforeCurrency, false, afterVal)}
                                    </View>
                                    <View style={{ justifyContent: 'center', paddingTop: Spacing.xs }}>
                                        <AppIcon name="arrowRight" size={Size.xxs} color={theme.textTertiary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
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
            <View style={{ marginTop: Spacing.md, padding: Spacing.sm, borderRadius: Shape.radius.sm, backgroundColor: theme.surfaceSecondary }}>
                {Object.entries(changes).map(([key, value]) => (
                    <View key={key} style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.xs }}>
                        <AppText variant="caption" weight="bold">{key}: </AppText>
                        {renderChangeValue(key, value)}
                    </View>
                ))}
            </View>
        );
    };

    return {
        actionColor,
        actionIcon,
        parsedChanges,
        entityLabel: `${item.entityType.charAt(0).toUpperCase()}${item.entityType.slice(1)}`,
        timestampLabel: formatDate(item.timestamp, { includeTime: true }),
        entityIdLabel: AppConfig.strings.audit.idLabel(item.entityId.substring(0, AUDIT_ID_PREVIEW_LEN)),
        renderChanges,
    };
}
