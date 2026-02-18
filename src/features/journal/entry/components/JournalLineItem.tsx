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
    getLineBaseAmount,
}: JournalLineItemProps) => {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            {/* Header: Account & Amount */}
            <View style={styles.row}>
                <TouchableOpacity
                    style={[styles.accountSelector, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={onSelectAccount}
                >
                    <View style={{ flex: 1 }}>
                        <AppText variant="body" weight="medium" numberOfLines={1}>
                            {line.accountName || AppConfig.strings.advancedEntry.selectAccount}
                        </AppText>
                        {line.accountName ? (
                            <AppText variant="caption" color="secondary" numberOfLines={1}>
                                {line.accountType}
                            </AppText>
                        ) : null}
                    </View>
                    <AppText variant="caption" color="secondary">▼</AppText>
                </TouchableOpacity>

                <View style={styles.amountContainer}>
                    <View style={[styles.amountInputWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        {line.accountCurrency && (
                            <AppText variant="caption" color="secondary" style={{ paddingLeft: Spacing.sm }}>
                                {line.accountCurrency}
                            </AppText>
                        )}
                        <AppInput
                            value={line.amount}
                            onChangeText={(value) => onUpdate('amount', value)}
                            placeholder="0.00"
                            keyboardType="numeric"
                            style={styles.amountInput}
                            containerStyle={{ flex: 1, borderWidth: 0 }}
                            testID={`amount-input-${line.id}`}
                        />
                    </View>
                </View>
            </View>

            {/* Sub-row: Type & Notes */}
            <View style={styles.row}>
                <View style={styles.typeSelector}>
                    <TouchableOpacity
                        style={[
                            styles.typeSegment,
                            { borderColor: theme.border, borderRightWidth: 0, borderTopLeftRadius: Shape.radius.r2, borderBottomLeftRadius: Shape.radius.r2 },
                            line.transactionType === TransactionType.DEBIT && { backgroundColor: theme.primary, borderColor: theme.primary }
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
                            { borderColor: theme.border, borderLeftWidth: 1, borderTopRightRadius: Shape.radius.r2, borderBottomRightRadius: Shape.radius.r2 },
                            line.transactionType === TransactionType.CREDIT && { backgroundColor: theme.primary, borderColor: theme.primary }
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
                        containerStyle={{ height: 36 }}
                        style={{ fontSize: 13, paddingVertical: 0 }}
                    />
                </View>

                {canRemove && (
                    <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
                        <AppText variant="caption" color="error">×</AppText>
                    </TouchableOpacity>
                )}
            </View>

            {/* Exchange Rate (Conditional) */}
            {line.accountCurrency && line.accountCurrency !== (preferences.defaultCurrencyCode || AppConfig.defaultCurrency) && (
                <View style={[styles.row, { marginTop: Spacing.xs }]}>
                    <AppText variant="caption" color="secondary">
                        ≈ {CurrencyFormatter.format(getLineBaseAmount(line))}
                    </AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                        <AppText variant="caption" color="secondary">@</AppText>
                        <AppInput
                            value={line.exchangeRate || ''}
                            onChangeText={(value) => onUpdate('exchangeRate', value)}
                            placeholder="Rate"
                            keyboardType="decimal-pad"
                            containerStyle={{ width: 80, height: 30 }}
                            style={{ fontSize: 12, paddingVertical: 0, textAlign: 'right' }}
                        />
                        {onAutoFetchRate && (
                            <TouchableOpacity onPress={onAutoFetchRate} style={{ padding: 4 }}>
                                <AppText variant="caption" color="primary">Fetch</AppText>
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
        paddingVertical: Spacing.md,
        gap: Spacing.sm,
    },
    row: {
        flexDirection: 'row',
        gap: Spacing.md,
        alignItems: 'center',
    },
    accountSelector: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderWidth: 1,
        borderRadius: Shape.radius.r2,
        height: 44, // Match typical input height
    },
    amountContainer: {
        width: 120,
    },
    amountInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: Shape.radius.r2,
        height: 44,
        overflow: 'hidden',
    },
    amountInput: {
        textAlign: 'right',
        paddingRight: Spacing.sm,
        fontWeight: '600',
    },
    typeSelector: {
        flexDirection: 'row',
        height: 36,
    },
    typeSegment: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    removeButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 59, 48, 0.1)',
        borderRadius: Shape.radius.r2,
    },
    divider: {
        height: 1,
        width: '100%',
        marginTop: Spacing.sm,
        opacity: 0.5,
    }
});
