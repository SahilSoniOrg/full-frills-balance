import { AppCard, AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Palette, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getContrastColor } from '@/src/utils/colorUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React, { useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { AccountBalance } from '@/src/types/domain';

interface AccountCardProps {
    account: Account;
    onPress: (account: Account) => void;
    balanceData?: AccountBalance | null;
    isLoading?: boolean;
}

/**
 * AccountCard - High-fidelity card for accounts
 * Inspired by Ivy Wallet's Account cards
 */
export const AccountCard = ({ account, onPress, balanceData, isLoading = false }: AccountCardProps) => {

    const { theme } = useTheme();
    const ui = useUI();

    const balance = balanceData?.balance || 0;
    const monthlyIncome = balanceData?.monthlyIncome || 0;
    const monthlyExpenses = balanceData?.monthlyExpenses || 0;

    // Account type colors for card background/accent
    let accentColor = theme.asset;
    const typeLower = account.accountType.toLowerCase();

    if (typeLower === 'liability') accentColor = theme.liability;
    else if (typeLower === 'equity') accentColor = theme.equity;
    else if (typeLower === 'income') accentColor = theme.income;
    else if (typeLower === 'expense') accentColor = theme.expense;

    const contrastColor = getContrastColor(accentColor);
    const textColor = contrastColor === 'white' ? Palette.pureWhite : Palette.trueBlack;

    const handlePress = useCallback(() => {
        onPress(account);
    }, [account, onPress]);

    return (
        <AppCard
            elevation="sm"
            style={[styles.container, { backgroundColor: theme.surface }]}
            padding="none"
        >
            <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
                {/* Ivy-style Header: Full colored background */}
                <View style={[styles.headerSection, { backgroundColor: accentColor }]}>
                    <View style={styles.headerTop}>
                        <IvyIcon
                            name={account.icon as any}
                            label={account.name}
                            color={textColor}
                            size={Size.avatarSm}
                        />
                        <AppText variant="body" weight="bold" style={[styles.accountName, { color: textColor }]} numberOfLines={1}>
                            {account.name}
                        </AppText>
                    </View>

                    <View style={styles.balanceSection}>
                        <AppText variant="title" weight="bold" style={[styles.balanceText, { color: textColor }]}>
                            {isLoading ? '...' : CurrencyFormatter.format(balance, account.currencyCode)}
                        </AppText>
                    </View>
                </View>

                {/* Ivy-style Footer: Monthly Income/Expenses */}
                {ui.showAccountMonthlyStats && (
                    <View
                        style={[styles.footerSection, { backgroundColor: theme.surface }]}
                        accessibilityLabel={`Monthly statistics for ${account.name}`}
                        accessibilityRole="summary"
                    >
                        <View style={styles.statsColumn} accessibilityLabel={`Monthly Income: ${CurrencyFormatter.format(monthlyIncome, account.currencyCode)}`}>
                            <AppText variant="caption" weight="bold" color="secondary" style={styles.statsLabel}>
                                MONTH INCOME
                            </AppText>
                            <AppText variant="body" weight="bold" style={styles.statsValue}>
                                {CurrencyFormatter.format(monthlyIncome, account.currencyCode)}
                            </AppText>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.divider }]} accessibilityRole="none" />

                        <View style={styles.statsColumn} accessibilityLabel={`Monthly Expenses: ${CurrencyFormatter.format(monthlyExpenses, account.currencyCode)}`}>
                            <AppText variant="caption" weight="bold" color="secondary" style={styles.statsLabel}>
                                MONTH EXPENSES
                            </AppText>
                            <AppText variant="body" weight="bold" style={styles.statsValue}>
                                {CurrencyFormatter.format(monthlyExpenses, account.currencyCode)}
                            </AppText>
                        </View>
                    </View>
                )}
            </TouchableOpacity>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.lg,
        borderRadius: Shape.radius.xl,
        overflow: 'hidden',
    },
    headerSection: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.xxxxl,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.md,
    },
    titleInfo: {
        marginLeft: Spacing.sm,
        flex: 1,
    },
    accountName: {
        fontSize: Typography.sizes.lg,
        flex: 1,
    },
    balanceSection: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    balanceText: {
        fontSize: Typography.sizes.xxxl,
        fontFamily: Typography.fonts.bold,
    },
    footerSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
    statsColumn: {
        flex: 1,
        alignItems: 'center',
    },
    statsLabel: {
        fontSize: Typography.sizes.xs,
        marginBottom: Spacing.xs,
        opacity: Opacity.heavy,
    },
    statsValue: {
        fontSize: Typography.sizes.sm,
    },
    divider: {
        width: 2,
        height: 32,
        borderRadius: 1,
    },
});
