import { AppCard, AppText, Badge } from '@/components/core';
import { Shape, Spacing, ThemeMode, useThemeColors } from '@/constants';
import { useAccountBalance } from '@/hooks/use-data';
import Account from '@/src/data/models/Account';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountCardProps {
    account: Account;
    themeMode: ThemeMode;
    onPress: (account: Account) => void;
}

/**
 * AccountCard - High-fidelity card for accounts
 * Inspired by Ivy Wallet's Account cards
 */
export const AccountCard = ({ account, themeMode, onPress }: AccountCardProps) => {
    const { balanceData, isLoading } = useAccountBalance(account.id);
    const theme = useThemeColors(themeMode);

    const balance = balanceData?.balance || 0;
    const transactionCount = balanceData?.transactionCount || 0;

    // Determine color based on account type
    let typeColor = theme.asset;
    const typeLower = account.accountType.toLowerCase();
    if (typeLower === 'liability') typeColor = theme.liability;
    if (typeLower === 'equity') typeColor = theme.equity;
    if (typeLower === 'income') typeColor = theme.income;
    if (typeLower === 'expense') typeColor = theme.expense;

    return (
        <AppCard
            elevation="sm"
            style={styles.container}
            themeMode={themeMode}
        >
            <TouchableOpacity onPress={() => onPress(account)} style={styles.content}>
                <View style={styles.row}>
                    {/* Circular Type Icon */}
                    <View style={[styles.typeIcon, { backgroundColor: typeColor }]}>
                        <AppText style={styles.typeIconLabel}>
                            {account.name.charAt(0).toUpperCase()}
                        </AppText>
                    </View>

                    <View style={styles.mainInfo}>
                        <AppText variant="heading" themeMode={themeMode} numberOfLines={1}>
                            {account.name}
                        </AppText>
                        <View style={styles.badgeRow}>
                            <Badge variant={typeLower as any} size="sm" themeMode={themeMode}>
                                {account.accountType}
                            </Badge>
                            <AppText variant="caption" color="secondary" themeMode={themeMode} style={styles.txCount}>
                                {transactionCount} txs
                            </AppText>
                        </View>
                    </View>

                    <View style={styles.amountInfo}>
                        <AppText variant="subheading" themeMode={themeMode} style={styles.amountText}>
                            {isLoading ? '...' : balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </AppText>
                        <AppText variant="caption" color="secondary" themeMode={themeMode}>
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
    content: {
        padding: Spacing.lg,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    typeIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.md,
    },
    typeIconLabel: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: 'bold',
    },
    mainInfo: {
        flex: 1,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    txCount: {
        marginLeft: Spacing.sm,
    },
    amountInfo: {
        alignItems: 'flex-end',
    },
    amountText: {
        fontWeight: 'bold',
    },
});
