import { AppCard, AppText, Stack } from '@/src/components/core';
import { Palette, Shape, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { logger } from '@/src/utils/logger';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

/**
 * AccountReorderScreen - Manage the display order of all accounts.
 * Uses fractional/averaging logic for orderNum updates (Double-based).
 */
export default function AccountReorderScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const { accounts: initialAccounts, isLoading } = useAccounts();
    const [accounts, setAccounts] = useState<Account[]>([]);

    useEffect(() => {
        if (!isLoading) {
            setAccounts([...initialAccounts]);
        }
    }, [initialAccounts, isLoading]);

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= accounts.length) return;

        const newAccounts = [...accounts];
        const item = newAccounts[index];

        // Remove item and re-insert at new position
        newAccounts.splice(index, 1);
        newAccounts.splice(newIndex, 0, item);

        // Calculate new orderNum based on neighbors
        // Same logic as Ivy Wallet calculateOrderNum
        const itemBefore = newAccounts[newIndex - 1];
        const itemAfter = newAccounts[newIndex + 1];

        let newOrderNum = 0;
        if (itemBefore && itemAfter) {
            newOrderNum = ((itemBefore.orderNum || 0) + (itemAfter.orderNum || 0)) / 2;
        } else if (itemBefore) {
            newOrderNum = (itemBefore.orderNum || 0) + 1;
        } else if (itemAfter) {
            newOrderNum = (itemAfter.orderNum || 0) - 1;
        } else {
            newOrderNum = 0;
        }

        // Optimistic update
        setAccounts(newAccounts);

        // Persistent update
        try {
            await accountRepository.updateOrder(item, newOrderNum);
        } catch (error) {
            logger.error('Failed to update account order:', error);
            // Revert if failed
            setAccounts([...initialAccounts]);
        }
    };

    if (isLoading) return null;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
                <AppText variant="subheading" weight="bold">Reorder Accounts</AppText>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <AppText variant="caption" color="secondary" style={styles.tipText}>
                    Manual ordering affects all lists. Accounts are grouped by category but follow this sequence.
                </AppText>

                <Stack space="sm">
                    {accounts.map((account, index) => (
                        <AppCard key={account.id} padding="none" style={styles.itemCard}>
                            <View style={styles.itemContent}>
                                <View style={styles.dragHandle}>
                                    <Ionicons name="menu" size={20} color={theme.textSecondary} />
                                </View>

                                <View style={styles.accountInfo}>
                                    <AppText variant="body" weight="semibold" numberOfLines={1}>
                                        {account.name}
                                    </AppText>
                                    <AppText variant="caption" color="secondary">
                                        {account.accountType} • {account.currencyCode}
                                    </AppText>
                                </View>

                                <View style={styles.actions}>
                                    <TouchableOpacity
                                        onPress={() => handleMove(index, 'up')}
                                        disabled={index === 0}
                                        style={[styles.actionButton, index === 0 && { opacity: 0.3 }]}
                                    >
                                        <Ionicons name="chevron-up" size={20} color={theme.text} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleMove(index, 'down')}
                                        disabled={index === accounts.length - 1}
                                        style={[styles.actionButton, index === accounts.length - 1 && { opacity: 0.3 }]}
                                    >
                                        <Ionicons name="chevron-down" size={20} color={theme.text} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </AppCard>
                    ))}
                </Stack>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: Spacing.xs,
    },
    scrollContent: {
        padding: Spacing.lg,
    },
    tipText: {
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    itemCard: {
        borderRadius: Shape.radius.md,
    },
    itemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
    },
    dragHandle: {
        marginRight: Spacing.md,
    },
    accountInfo: {
        flex: 1,
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.xs,
    },
    actionButton: {
        padding: Spacing.xs,
        backgroundColor: Palette.trueBlack + '05', // Subtle overlay
        borderRadius: Shape.radius.sm,
    }
});
