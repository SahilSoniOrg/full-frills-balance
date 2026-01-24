import { AppInput, AppText } from '@/components/core';
import { AppConfig, Shape, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { preferences } from '@/src/utils/preferences';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

// Reuse the interface for now to minimize friction, eventually move to shared types
export interface JournalEntryLine {
    id: string;
    accountId: string;
    accountName: string;
    accountType: AccountType;
    accountCurrency?: string;
    amount: string;
    amountInJournalCurrency?: number;
    transactionType: TransactionType;
    notes: string;
    exchangeRate?: string;
}

interface JournalLineItemProps {
    line: JournalEntryLine;
    index: number;
    canRemove: boolean;
    onUpdate: (field: keyof JournalEntryLine, value: any) => void;
    onRemove: () => void;
    onSelectAccount: () => void;
    getLineBaseAmount: (line: JournalEntryLine) => number;
}

export function JournalLineItem({
    line,
    index,
    canRemove,
    onUpdate,
    onRemove,
    onSelectAccount,
    getLineBaseAmount,
}: JournalLineItemProps) {
    const { theme } = useTheme();

    return (
        <View style={[styles.lineContainer, {
            backgroundColor: theme.surfaceSecondary,
            borderColor: theme.border
        }]}>
            <View style={styles.lineHeader}>
                <AppText variant="subheading">Line {index + 1}</AppText>
                {canRemove && (
                    <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
                        <AppText variant="body" color="error">Remove</AppText>
                    </TouchableOpacity>
                )}
            </View>

            <TouchableOpacity
                style={[styles.accountSelector, {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                }]}
                onPress={onSelectAccount}
            >
                <AppText variant="body">
                    {line.accountName || 'Select Account'}
                </AppText>
                <AppText variant="body" color="secondary">▼</AppText>
            </TouchableOpacity>

            <View style={styles.lineRow}>
                <View style={styles.halfWidth}>
                    <AppText variant="body" style={styles.label}>Type</AppText>
                    <View style={styles.typeButtons}>
                        <TouchableOpacity
                            style={[
                                styles.typeButton,
                                line.transactionType === TransactionType.DEBIT && styles.typeButtonActive,
                                line.transactionType === TransactionType.DEBIT && { backgroundColor: theme.primary },
                                { borderColor: theme.border }
                            ]}
                            onPress={() => onUpdate('transactionType', TransactionType.DEBIT)}
                        >
                            <AppText
                                variant="body"
                                style={[
                                    line.transactionType === TransactionType.DEBIT && { color: theme.pureInverse }
                                ]}
                            >
                                Debit
                            </AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.typeButton,
                                line.transactionType === TransactionType.CREDIT && styles.typeButtonActive,
                                line.transactionType === TransactionType.CREDIT && { backgroundColor: theme.primary },
                                { borderColor: theme.border }
                            ]}
                            onPress={() => onUpdate('transactionType', TransactionType.CREDIT)}
                        >
                            <AppText
                                variant="body"
                                style={[
                                    line.transactionType === TransactionType.CREDIT && { color: theme.pureInverse }
                                ]}
                            >
                                Credit
                            </AppText>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.halfWidth}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="body" style={styles.label}>Amount</AppText>
                        {line.accountCurrency && (
                            <AppText variant="caption" color="primary">
                                {line.accountCurrency}
                            </AppText>
                        )}
                    </View>
                    <AppInput
                        value={line.amount}
                        onChangeText={(value) => onUpdate('amount', value)}
                        placeholder="0.00"
                        keyboardType="numeric"
                    />
                    {line.accountCurrency && line.accountCurrency !== (preferences.defaultCurrencyCode || AppConfig.defaultCurrency) && (
                        <AppText variant="caption" color="secondary">
                            ≈ {CurrencyFormatter.format(getLineBaseAmount(line))}
                        </AppText>
                    )}
                </View>
            </View>

            <AppInput
                label="Notes"
                value={line.notes}
                onChangeText={(value) => onUpdate('notes', value)}
                placeholder="Optional notes"
                containerStyle={{ marginBottom: Spacing.md }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs }}>
                <AppText variant="body" weight="medium">
                    Exchange Rate (Optional)
                </AppText>
                {line.accountCurrency && line.accountCurrency !== (preferences.defaultCurrencyCode || AppConfig.defaultCurrency) && (
                    <TouchableOpacity
                        onPress={async () => {
                            try {
                                const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
                                const rate = await exchangeRateService.getRate(
                                    line.accountCurrency!,
                                    defaultCurrency
                                )
                                onUpdate('exchangeRate', rate.toString())
                            } catch (error) {
                                console.error('Failed to fetch rate:', error)
                            }
                        }}
                    >
                        <AppText variant="caption" color="primary">Auto-fetch</AppText>
                    </TouchableOpacity>
                )}
            </View>
            <AppInput
                value={line.exchangeRate || ''}
                onChangeText={(value) => onUpdate('exchangeRate', value)}
                placeholder="e.g., 1.1050"
                keyboardType="decimal-pad"
            />
            <AppText variant="caption" color="secondary" style={{ marginTop: Spacing.xs, marginBottom: Spacing.md }}>
                {line.accountCurrency === (preferences.defaultCurrencyCode || AppConfig.defaultCurrency)
                    ? 'Not needed (same as base currency)'
                    : `Rate to convert ${line.accountCurrency} to ${preferences.defaultCurrencyCode || AppConfig.defaultCurrency}`}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    lineContainer: {
        borderWidth: 1,
        borderRadius: Shape.radius.r2,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    lineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    removeButton: {
        padding: Spacing.sm,
    },
    accountSelector: {
        gap: Spacing.sm,
        padding: Spacing.md,
        borderRadius: Shape.radius.r3,
        borderWidth: 1,
        marginBottom: Spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        marginBottom: Spacing.xs,
        fontWeight: '600',
    },
    lineRow: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginBottom: Spacing.md,
    },
    halfWidth: {
        flex: 1,
    },
    typeButtons: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    typeButton: {
        flex: 1,
        borderWidth: 1,
        borderRadius: Shape.radius.full,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        alignItems: 'center',
    },
    typeButtonActive: {
        // Handled by inline styles
    },
});
