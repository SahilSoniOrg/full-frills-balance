import { AppCard, AppText, Badge, IvyIcon } from '@/components/core';
import { Opacity, Palette, Shape, Spacing, Typography, withOpacity } from '@/constants';
import { useUI } from '@/contexts/UIContext';
import { useAccountBalance } from '@/hooks/use-data';
import { useTheme } from '@/hooks/use-theme';
import Account from '@/src/data/models/Account';
import { getContrastColor } from '@/src/utils/colorUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { AccountBalance } from '@/src/data/repositories/AccountRepository';

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
    const { isPrivacyMode } = useUI();

    const balance = balanceData?.balance || 0;
    const transactionCount = balanceData?.transactionCount || 0;

    // Account type colors for card background/accent
    let accentColor = theme.asset;
    const typeLower = account.accountType.toLowerCase();

    if (typeLower === 'liability') accentColor = theme.liability as any;
    else if (typeLower === 'equity') accentColor = theme.equity as any;
    else if (typeLower === 'income') accentColor = theme.income as any;
    else if (typeLower === 'expense') accentColor = theme.expense as any;

    const contrastColor = getContrastColor(accentColor);
    const textColor = contrastColor === 'white' ? Palette.pureWhite : Palette.trueBlack;
    const subTextColor = withOpacity(textColor, Opacity.heavy);

    return (
        <AppCard
            elevation="sm"
            style={[styles.container, { backgroundColor: theme.surface }]}
            padding="none"
        >
            <TouchableOpacity onPress={() => onPress(account)}>
                {/* Ivy-style Header: Full colored background */}
                <View style={[styles.headerSection, { backgroundColor: accentColor }]}>
                    <View style={styles.headerTop}>
                        <IvyIcon
                            label={account.name}
                            color={textColor}
                            size={32}
                        />
                        <View style={styles.titleInfo}>
                            <AppText variant="body" weight="bold" style={{ color: textColor }} numberOfLines={1}>
                                {account.name}
                            </AppText>
                            <AppText variant="caption" style={{ color: subTextColor }}>
                                {account.accountType}
                            </AppText>
                        </View>
                        <Badge variant="default" size="sm" style={{ backgroundColor: textColor }}>
                            <AppText variant="caption" weight="bold" style={{ color: accentColor, fontSize: Typography.sizes.xs }}>
                                {transactionCount}
                            </AppText>
                        </Badge>
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
        marginBottom: Spacing.md,
        borderRadius: Shape.radius.xl,
        overflow: 'hidden',
    },
    headerSection: {
        padding: Spacing.lg,
        paddingBottom: Spacing.xl,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    titleInfo: {
        marginLeft: Spacing.md,
        flex: 1,
    },
    balanceSection: {
        marginTop: Spacing.sm,
    },
    balanceText: {
        fontSize: Typography.sizes.xxxl,
        fontFamily: Typography.fonts.bold,
    },
});
