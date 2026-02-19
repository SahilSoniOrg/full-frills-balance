import { AppInput, AppText } from '@/src/components/core';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { TransactionType } from '@/src/data/models/Transaction';
import { useTheme } from '@/src/hooks/use-theme';
import { JournalEntryLine } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { preferences } from '@/src/utils/preferences';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalLineItemProps {
    line: JournalEntryLine;
    index: number;
    canRemove: boolean;
    onUpdate: <K extends keyof JournalEntryLine>(field: K, value: JournalEntryLine[K]) => void;
    onRemove: () => void;
    onSelectAccount: () => void;
    onAutoFetchRate?: () => void;
    onBalanceLine?: () => void;
    getLineBaseAmount: (line: JournalEntryLine) => number;
}

export const JournalLineItem = React.memo(({
    line,
    index,
    canRemove,
    onUpdate,
    onRemove,
    onSelectAccount,
    onAutoFetchRate,
    onBalanceLine,
    getLineBaseAmount,
}: JournalLineItemProps) => {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            {/* Main Row: Account & Amount */}
            <View style={styles.mainRow}>
                <TouchableOpacity
                    style={[styles.accountSelector, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={onSelectAccount}
                >
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                        <AppText variant="caption" color="secondary" weight="bold" style={{ fontSize: 10, marginBottom: 2, letterSpacing: 0.5 }}>
                            ACCOUNT
                        </AppText>
                        <AppText variant="body" weight="semibold" numberOfLines={1}>
                            {line.accountName || AppConfig.strings.advancedEntry.selectAccount}
                        </AppText>
                    </View>
                    <AppText variant="caption" color="secondary" style={{ paddingLeft: Spacing.sm }}>▼</AppText>
                </TouchableOpacity>

                <View style={styles.amountContainer}>
                    <View style={[styles.amountInputWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={{ flex: 1, paddingLeft: Spacing.md, paddingVertical: 4 }}>
                            <AppText variant="caption" color="secondary" weight="bold" style={{ fontSize: 10, marginBottom: 0, letterSpacing: 0.5 }}>
                                {line.accountCurrency || AppConfig.defaultCurrency}
                            </AppText>
                            <AppInput
                                value={line.amount}
                                onChangeText={(value) => onUpdate('amount', value)}
                                placeholder="0.00"
                                keyboardType="numeric"
                                style={styles.amountInput}
                                variant="minimal"
                                containerStyle={{ minHeight: 0 }}
                                testID={`amount-input-${line.id}`}
                            />
                        </View>
                    </View>
                </View>
            </View>

            {/* Sub Row: Type, Notes and Action */}
            <View style={styles.secondaryRow}>
                <View style={[styles.typeSelector, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
                    <TouchableOpacity
                        style={[
                            styles.typeSegment,
                            line.transactionType === TransactionType.DEBIT && { backgroundColor: theme.primary }
                        ]}
                        onPress={() => onUpdate('transactionType', TransactionType.DEBIT)}
                    >
                        <AppText
                            variant="caption"
                            weight="bold"
                            style={line.transactionType === TransactionType.DEBIT ? { color: theme.pureInverse } : { color: theme.textSecondary }}
                        >
                            DR
                        </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.typeSegment,
                            line.transactionType === TransactionType.CREDIT && { backgroundColor: theme.primary }
                        ]}
                        onPress={() => onUpdate('transactionType', TransactionType.CREDIT)}
                    >
                        <AppText
                            variant="caption"
                            weight="bold"
                            style={line.transactionType === TransactionType.CREDIT ? { color: theme.pureInverse } : { color: theme.textSecondary }}
                        >
                            CR
                        </AppText>
                    </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                    <AppInput
                        value={line.notes}
                        onChangeText={(value) => onUpdate('notes', value)}
                        placeholder={AppConfig.strings.advancedEntry.notesPlaceholder}
                        containerStyle={{ height: 44 }}
                        style={{ fontSize: 14 }}
                    />
                </View>

                {canRemove && (
                    <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
                        <AppText variant="body" color="error" weight="bold">×</AppText>
                    </TouchableOpacity>
                )}
            </View>

            {/* Exchange Rate (Conditional) */}
            {line.accountCurrency && line.accountCurrency !== (preferences.defaultCurrencyCode || AppConfig.defaultCurrency) && (
                <View style={[styles.exchangeRateRow, { backgroundColor: theme.surfaceSecondary }]}>
                    <View style={{ flex: 1 }}>
                        <AppText variant="caption" color="secondary">
                            ≈ {CurrencyFormatter.format(getLineBaseAmount(line))}
                        </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                        <AppText variant="caption" color="secondary">Rate:</AppText>
                        <AppInput
                            value={line.exchangeRate || ''}
                            onChangeText={(value) => onUpdate('exchangeRate', value)}
                            placeholder="1.0"
                            keyboardType="decimal-pad"
                            variant="minimal"
                            containerStyle={{ width: 60, minHeight: 0 }}
                            style={{ fontSize: 13, textAlign: 'right' }}
                        />
                        {onBalanceLine && (
                            <TouchableOpacity onPress={onBalanceLine} style={styles.fetchButton}>
                                <AppText variant="caption" color="primary" weight="semibold">Balance</AppText>
                            </TouchableOpacity>
                        )}
                        {onAutoFetchRate && (
                            <TouchableOpacity onPress={onAutoFetchRate} style={styles.fetchButton}>
                                <AppText variant="caption" color="secondary" weight="semibold">Fetch</AppText>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        paddingVertical: Spacing.lg,
        gap: Spacing.md,
    },
    mainRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        alignItems: 'flex-start',
    },
    secondaryRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        alignItems: 'center',
    },
    accountSelector: {
        flex: 1.4,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        height: 68, // Increased height to prevent clipping
    },
    amountContainer: {
        flex: 1,
    },
    amountInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        height: 68, // Increased height to prevent clipping
        overflow: 'hidden',
    },
    amountInput: {
        textAlign: 'right',
        fontSize: 18,
        fontWeight: '700',
        paddingRight: Spacing.sm,
        minHeight: 0,
    },
    typeSelector: {
        flexDirection: 'row',
        height: 44,
        borderRadius: Shape.radius.r2,
        padding: 4,
        borderWidth: 1,
        alignItems: 'center',
    },
    typeSegment: {
        width: 44,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Shape.radius.r2 - 4,
    },
    removeButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 59, 48, 0.1)',
        borderRadius: Shape.radius.r2,
    },
    exchangeRateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: Shape.radius.r2,
        marginTop: -Spacing.xs,
    },
    fetchButton: {
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.sm,
    },
    divider: {
        height: 1,
        width: '100%',
        marginTop: Spacing.sm,
        opacity: 0.3,
    }
});
