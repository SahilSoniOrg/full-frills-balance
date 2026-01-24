import { AppCard, AppText } from '@/components/core';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { preferences } from '@/src/utils/preferences';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface JournalSummaryProps {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
}

export function JournalSummary({
    totalDebits,
    totalCredits,
    isBalanced,
}: JournalSummaryProps) {
    const { theme } = useTheme();
    const currency = preferences.defaultCurrencyCode || 'USD';
    const difference = Math.abs(totalDebits - totalCredits);

    return (
        <AppCard style={styles.card}>
            <AppText variant="subheading" style={styles.title}>
                Summary
            </AppText>

            <View style={styles.summaryRow}>
                <AppText variant="body">Total Debits:</AppText>
                <AppText variant="body">{totalDebits.toFixed(2)} {currency}</AppText>
            </View>

            <View style={styles.summaryRow}>
                <AppText variant="body">Total Credits:</AppText>
                <AppText variant="body">{totalCredits.toFixed(2)} {currency}</AppText>
            </View>

            <View style={styles.summaryRow}>
                <AppText variant="heading">Balance:</AppText>
                <AppText
                    variant="heading"
                    color={isBalanced ? "success" : "error"}
                >
                    {difference.toFixed(2)} {currency}
                </AppText>
            </View>

            <AppText
                variant="body"
                color={isBalanced ? "success" : "error"}
                style={styles.balanceText}
            >
                {isBalanced ? `✓ Journal is balanced in ${currency}` : `✗ Journal must be balanced in ${currency}`}
            </AppText>
        </AppCard>
    );
}

const styles = StyleSheet.create({
    card: {
        margin: Spacing.lg,
        marginTop: Spacing.sm,
    },
    title: {
        marginBottom: Spacing.md,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
    },
    balanceText: {
        marginTop: Spacing.sm,
        textAlign: 'center',
        fontWeight: '600',
    },
});
