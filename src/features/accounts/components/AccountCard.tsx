import { AppCard, AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Palette, Shape, Spacing, Typography } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useAccountBalance } from '@/src/features/accounts/hooks/useAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { getContrastColor } from '@/src/utils/colorUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React, { useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { AccountBalance } from '@/src/types/domain';

interface AccountCardProps {
    account: Account;
    onPress: (account: Account) => void;
    initialBalanceData?: AccountBalance;
}

/**
 * AccountCard - High-fidelity card for accounts
 * Inspired by Ivy Wallet's Account cards
 */
export const AccountCard = ({ account, onPress, initialBalanceData }: AccountCardProps) => {
    const hookData = useAccountBalance(initialBalanceData ? null : account.id);
    const balanceData = initialBalanceData || hookData.balanceData;
    const isLoading = initialBalanceData ? false : hookData.isLoading;

    const { theme } = useTheme();

    const balance = balanceData?.balance || 0;
    const transactionCount = balanceData?.transactionCount || 0;

    // Account type colors for card background/accent
    let accentColor = theme.asset
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
            <TouchableOpacity onPress={handlePress}>
                {/* Ivy-style Header: Full colored background */}
                <View style={[styles.headerSection, { backgroundColor: accentColor }]}>
                    <View style={styles.headerTop}>
                        <IvyIcon
                            label={account.name}
                            color={textColor}
                            size={24}
                        />
                        <View style={styles.titleInfo}>
                            <AppText variant="body" weight="bold" style={[styles.accountName, { color: textColor }]} numberOfLines={1}>
                                {account.name}
                            </AppText>
                        </View>
                    </View>

                    <View style={styles.balanceSection}>
                        <AppText variant="title" style={[styles.balanceText, { color: textColor }]}>
                            {isLoading ? '...' : CurrencyFormatter.format(balance, account.currencyCode)}
                        </AppText>
                    </View>
                </View>
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
        paddingVertical: Spacing.xl,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    titleInfo: {
        marginLeft: Spacing.sm,
        flex: 1,
    },
    accountName: {
        fontSize: Typography.sizes.lg,
    },
    balanceSection: {
        marginTop: Spacing.xs,
        alignItems: 'center',
    },
    balanceText: {
        fontSize: Typography.sizes.hero / 1.5, // hero is too big (72), so we scale it or use xxxl
        fontFamily: Typography.fonts.bold,
    },
    reconciledText: {
        marginTop: Spacing.xs,
        opacity: Opacity.medium,
    },
});
