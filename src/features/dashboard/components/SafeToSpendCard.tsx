import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SafeToSpendCardProps {
    safeToSpend: number;
    committedBudget: number;
    committedRecurring: number;
    totalLiquidAssets: number;
    totalLiabilities: number;
    currencyCode: string;
    isLoading?: boolean;
}

export const SafeToSpendCard = ({
    safeToSpend,
    committedBudget,
    committedRecurring,
    totalLiquidAssets,
    totalLiabilities,
    currencyCode,
    isLoading = false
}: SafeToSpendCardProps) => {
    const { theme, fonts } = useTheme();

    const format = (val: number) => {
        if (isLoading) return '...';
        return CurrencyFormatter.format(val, currencyCode, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    };

    return (
        <AppCard
            elevation="md"
            padding="lg"
            radius="r1"
            style={[styles.container, { backgroundColor: theme.primary }]}
        >
            <View style={styles.header}>
                <AppText variant="subheading" style={{ color: withOpacity(theme.onPrimary, Opacity.medium) }}>
                    {AppConfig.strings.dashboard.safeToSpendTitle}
                </AppText>
                <AppIcon name="info" size={Size.xs} color={withOpacity(theme.onPrimary, Opacity.medium)} />
            </View>

            <AppText variant="hero" style={[styles.amount, { color: theme.onPrimary, fontFamily: fonts.bold }]}>
                {format(safeToSpend)}
            </AppText>

            <View style={[styles.divider, { backgroundColor: withOpacity(theme.onPrimary, Opacity.muted) }]} />

            <View style={styles.footer}>
                <View style={styles.footerItem}>
                    <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.soft) }}>
                        {AppConfig.strings.dashboard.assets}
                    </AppText>
                    <AppText variant="heading" style={{ color: theme.onPrimary }}>
                        {format(totalLiquidAssets)}
                    </AppText>
                </View>

                <View style={styles.minus}>
                    <AppText variant="body" style={{ color: theme.onPrimary }}>−</AppText>
                </View>

                <View style={styles.footerItem}>
                    <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.soft) }}>
                        {AppConfig.strings.dashboard.debts}
                    </AppText>
                    <AppText variant="heading" style={{ color: theme.onPrimary }}>
                        {format(totalLiabilities)}
                    </AppText>
                </View>

                <View style={styles.minus}>
                    <AppText variant="body" style={{ color: theme.onPrimary }}>−</AppText>
                </View>

                <View style={styles.footerItem}>
                    <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.soft) }}>
                        {AppConfig.strings.dashboard.budgets}
                    </AppText>
                    <AppText variant="heading" style={{ color: theme.onPrimary }}>
                        {format(committedBudget)}
                    </AppText>
                </View>

                <View style={styles.minus}>
                    <AppText variant="body" style={{ color: theme.onPrimary }}>−</AppText>
                </View>

                <View style={styles.footerItem}>
                    <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.soft) }}>
                        {AppConfig.strings.dashboard.bills}
                    </AppText>
                    <AppText variant="heading" style={{ color: theme.onPrimary }}>
                        {format(committedRecurring)}
                    </AppText>
                </View>
            </View>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    amount: {
        fontSize: Typography.sizes.xxxl * 1.5,
        marginBottom: Spacing.lg,
    },
    divider: {
        height: 1,
        width: '100%',
        marginBottom: Spacing.md,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerItem: {
        alignItems: 'center',
    },
    minus: {
        opacity: 0.6,
    }
});
