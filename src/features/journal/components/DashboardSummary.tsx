import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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
                    <View style={[styles.iconBox, { backgroundColor: withOpacity(theme.income, Opacity.soft) }]}>
                        <AppIcon name="arrowDown" size={Size.xs} color={theme.income} />
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
                    <View style={[styles.iconBox, { backgroundColor: withOpacity(theme.expense, Opacity.soft) }]}>
                        <AppIcon name="arrowUp" size={Size.xs} color={theme.expense} />
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
        width: Size.md,
        height: Size.md,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    value: {
        fontFamily: Typography.fonts.bold,
    },
});
