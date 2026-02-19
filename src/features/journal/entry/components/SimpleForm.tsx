import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TabType } from '../hooks/useSimpleJournalEditor';
import { SimpleFormAccountSections } from './SimpleFormAccountSections';
import { SimpleFormTabs } from './SimpleFormTabs';

export interface SimpleFormProps {
    type: TabType;
    setType: (type: TabType) => void;
    amount: string;
    setAmount: (amount: string) => void;
    sourceId: string;
    setSourceId: (id: string) => void;
    destinationId: string;
    setDestinationId: (id: string) => void;
    isSubmitting: boolean;
    exchangeRate: number | null;
    isLoadingRate: boolean;
    rateError: string | null;
    isCrossCurrency: boolean;
    convertedAmount: number;
    transactionAccounts: Account[];
    expenseAccounts: Account[];
    incomeAccounts: Account[];
    sourceAccount?: Account;
    destAccount?: Account;
    sourceCurrency?: string;
    destCurrency?: string;
}

export const SimpleForm = ({
    type,
    setType,
    amount,
    setAmount,
    sourceId,
    setSourceId,
    destinationId,
    setDestinationId,
    isSubmitting,
    exchangeRate,
    isLoadingRate,
    rateError,
    isCrossCurrency,
    convertedAmount,
    transactionAccounts,
    expenseAccounts,
    incomeAccounts,
    sourceAccount,
    destAccount,
    sourceCurrency,
    destCurrency,
}: SimpleFormProps) => {
    const { theme } = useTheme();

    const activeColor = type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary;
    const frameBorderColor = withOpacity(theme.textSecondary, Opacity.muted);

    const accountSections = type === 'expense'
        ? [
            { title: 'To Category / Account', accounts: expenseAccounts, selectedId: destinationId, onSelect: setDestinationId },
            { title: 'From Account', accounts: transactionAccounts, selectedId: sourceId, onSelect: setSourceId },
        ]
        : type === 'income'
            ? [
                { title: 'From Source / Account', accounts: incomeAccounts, selectedId: sourceId, onSelect: setSourceId },
                { title: 'To Account', accounts: transactionAccounts, selectedId: destinationId, onSelect: setDestinationId },
            ]
            : [
                { title: 'Source Account', accounts: transactionAccounts, selectedId: sourceId, onSelect: setSourceId },
                { title: 'Destination Account', accounts: transactionAccounts, selectedId: destinationId, onSelect: setDestinationId },
            ];

    return (
        <View style={styles.container}>
            <SimpleFormTabs
                type={type}
                setType={setType}
                activeColor={activeColor}
                frameBorderColor={frameBorderColor}
            />

            <SimpleFormAccountSections
                sections={accountSections}
                frameBorderColor={frameBorderColor}
            />

            {isCrossCurrency && sourceId && destinationId && (
                <View style={[styles.fxCard, { backgroundColor: withOpacity(theme.primary, Opacity.soft), borderColor: withOpacity(theme.primary, Opacity.medium) }]}>
                    {isLoadingRate ? (
                        <AppText variant="caption" color="secondary">{AppConfig.strings.transactionFlow.fetchingRate}</AppText>
                    ) : rateError ? (
                        <AppText variant="caption" color="error">{rateError}</AppText>
                    ) : exchangeRate ? (
                        <View style={styles.fxContent}>
                            <View style={styles.fxRateRow}>
                                <AppIcon name="refresh" size={Size.iconXs} color={theme.primary} />
                                <AppText variant="caption" color="primary" weight="medium">
                                    1 {sourceCurrency} = {exchangeRate.toFixed(4)} {destCurrency}
                                </AppText>
                            </View>
                            {parseFloat(amount) > 0 && (
                                <View style={styles.fxTotalPill}>
                                    <AppText variant="caption" color="primary" weight="bold">
                                        Total: {convertedAmount.toFixed(2)} {destCurrency}
                                    </AppText>
                                </View>
                            )}
                        </View>
                    ) : null}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: Spacing.lg,
        paddingBottom: Spacing.xxxxl, // Keep some padding at bottom
    },
    fxCard: {
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: Shape.radius.sm,
        marginBottom: Spacing.lg,
    },
    fxContent: {
        alignItems: 'center',
        gap: Spacing.sm,
    },
    fxRateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    fxTotalPill: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: Shape.radius.full,
    },
});
