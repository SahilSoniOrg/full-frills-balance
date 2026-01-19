import { Spacing } from '@/constants';
import { useUI } from '@/contexts/UIContext';
import { useTheme } from '@/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppCard, AppText } from '../core';

interface DashboardSummaryProps {
    income: number;
    expense: number;
    isHidden?: boolean;
}

export const DashboardSummary = ({ income, expense, isHidden: controlledHidden }: DashboardSummaryProps) => {
    const { theme } = useTheme();
    const { isPrivacyMode } = useUI();

    const isActuallyHidden = controlledHidden !== undefined ? controlledHidden : isPrivacyMode;

    const formatValue = (val: number) => {
        if (isActuallyHidden) return '••••';
        return CurrencyFormatter.format(val, undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    };

    return (
        <View style={styles.container}>
            {/* Income Column */}
            <AppCard elevation="sm" padding="md" style={styles.column}>
                <View style={styles.row}>
                    <View style={[styles.iconBox, { backgroundColor: theme.income + '20' }]}>
                        <Ionicons name="arrow-down-outline" size={16} color={theme.income} />
                    </View>
                    <AppText variant="caption" color="secondary">INCOME</AppText>
                </View>
                <AppText variant="subheading" style={[styles.value, { color: theme.income }]}>
                    {formatValue(income)}
                </AppText>
            </AppCard>

            {/* Expense Column */}
            <AppCard elevation="sm" padding="md" style={styles.column}>
                <View style={styles.row}>
                    <View style={[styles.iconBox, { backgroundColor: theme.expense + '20' }]}>
                        <Ionicons name="arrow-up-outline" size={16} color={theme.expense} />
                    </View>
                    <AppText variant="caption" color="secondary">EXPENSE</AppText>
                </View>
                <AppText variant="subheading" style={[styles.value, { color: theme.expense }]}>
                    {formatValue(expense)}
                </AppText>
            </AppCard>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    column: {
        flex: 1,
        // padding handled by AppCard
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    iconBox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    value: {
        fontWeight: 'bold',
    },
});
