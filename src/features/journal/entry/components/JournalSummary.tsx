import { AppCard, AppText, Box, Stack } from '@/components/core';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { preferences } from '@/src/utils/preferences';
import React from 'react';
import { StyleSheet } from 'react-native';

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
        <AppCard style={{ marginHorizontal: Spacing.lg, marginVertical: Spacing.sm }}>
            <Stack space="md">
                <AppText variant="subheading">
                    Summary
                </AppText>

                <Stack space="sm">
                    <Box direction="row" justify="space-between">
                        <AppText variant="body">Total Debits:</AppText>
                        <AppText variant="body">{totalDebits.toFixed(2)} {currency}</AppText>
                    </Box>

                    <Box direction="row" justify="space-between">
                        <AppText variant="body">Total Credits:</AppText>
                        <AppText variant="body">{totalCredits.toFixed(2)} {currency}</AppText>
                    </Box>
                </Stack>

                <Box direction="row" justify="space-between" style={{ paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <AppText variant="heading">Balance:</AppText>
                    <AppText
                        variant="heading"
                        color={isBalanced ? "success" : "error"}
                    >
                        {difference.toFixed(2)} {currency}
                    </AppText>
                </Box>

                <AppText
                    variant="body"
                    color={isBalanced ? "success" : "error"}
                    align="center"
                    weight="semibold"
                    style={{ marginTop: Spacing.xs }}
                >
                    {isBalanced ? `✓ Journal is balanced in ${currency}` : `✗ Journal must be balanced in ${currency}`}
                </AppText>
            </Stack>
        </AppCard>
    );
}

const styles = StyleSheet.create({});
