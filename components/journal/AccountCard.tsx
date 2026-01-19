import { AppCard, AppText, Badge, IvyIcon } from '@/components/core';
import { Shape, Spacing } from '@/constants';
import { useUI } from '@/contexts/UIContext';
import { useAccountBalance } from '@/hooks/use-data';
import { useTheme } from '@/hooks/use-theme';
import Account from '@/src/data/models/Account';
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
    // Only fetch if initial data is not provided, or better: use useAccountBalance but bypass if we have data?
    // Actually simpler: if initialBalanceData provided, use it. If not, fetch.
    // However, we want updates. useAccountBalance provides updates.
    // If we pass initial data, we usually still want live updates.
    // But AccountsScreen re-renders when useNetWorth updates (which updates balances).
    // So if we pass data from parent, we can just use that.

    // Let's defer to the hook if no data passed, otherwise use passed data.
    const hookData = useAccountBalance(initialBalanceData ? null : account.id);
    const balanceData = initialBalanceData || hookData.balanceData;
    const isLoading = initialBalanceData ? false : hookData.isLoading;

    const { theme } = useTheme();
    const { isPrivacyMode } = useUI();

    const balance = balanceData?.balance || 0;
    const transactionCount = balanceData?.transactionCount || 0;

    // Account type colors for card background/accent
    let backgroundColor = theme.surface;
    let accentColor = theme.asset;
    const typeLower = account.accountType.toLowerCase();

    // Ivy-like color mapping
    if (typeLower === 'liability') {
        accentColor = theme.liability as any;
    } else if (typeLower === 'equity') {
        accentColor = theme.equity as any;
    } else if (typeLower === 'income') {
        accentColor = theme.income as any;
    } else if (typeLower === 'expense') {
        accentColor = theme.expense as any;
    }

    return (
        <AppCard
            elevation="sm"
            style={[styles.container, { backgroundColor: theme.surface }]}
            padding="none" // Custom padding for layout
        >
            <TouchableOpacity onPress={() => onPress(account)}>
                {/* Colored Top Bar */}
                <View style={[styles.colorBar, { backgroundColor: accentColor }]} />

                <View style={styles.content}>
                    {/* Header: Icon & Name */}
                    <View style={styles.header}>
                        <IvyIcon
                            label={account.name}
                            color={accentColor} // Use the type color for the icon
                            size={40}
                        />
                        <View style={styles.titleInfo}>
                            <AppText variant="heading" numberOfLines={1}>
                                {account.name}
                            </AppText>
                            <AppText variant="caption" color="secondary" style={styles.txCount}>
                                {transactionCount} Transactions
                            </AppText>
                        </View>
                        <Badge variant={typeLower as any} size="sm">
                            {account.accountType}
                        </Badge>
                    </View>

                    {/* Balance */}
                    <View style={styles.amountInfo}>
                        <AppText variant="title" style={[styles.amountText, { color: accentColor }]}>
                            {isLoading ? '...' : balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                            {account.currencyCode}
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
    colorBar: {
        height: 6,
        width: '100%',
    },
    content: {
        padding: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    titleInfo: {
        marginLeft: Spacing.md,
        flex: 1,
    },
    txCount: {
        marginTop: 2,
    },
    amountInfo: {
        alignItems: 'flex-start', // Left align balance for impact
    },
    amountText: {
        fontSize: 32, // Large balance
        fontWeight: 'bold',
        marginBottom: -4, // Tighten up currency line
    },
});
