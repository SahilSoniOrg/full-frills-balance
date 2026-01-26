/**
 * Account Details Screen
 * 
 * Shows account information and transaction history
 */

import { AppButton, AppCard, AppText, Badge, FloatingActionButton, IconButton, IvyIcon } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { Shape, Spacing } from '@/src/constants'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { useAccount, useAccountBalance } from '@/src/features/accounts/hooks/useAccounts'
import { TransactionItem, useAccountTransactions } from '@/src/features/journal'
import { useTheme } from '@/src/hooks/use-theme'
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native'

export default function AccountDetailsScreen() {
    const router = useRouter()
    const params = useLocalSearchParams()
    const { theme } = useTheme()
    const accountId = params.accountId as string

    const { account, isLoading: accountLoading } = useAccount(accountId)
    const { transactions, isLoading: transactionsLoading } = useAccountTransactions(accountId)
    const { balanceData, isLoading: balanceLoading } = useAccountBalance(accountId)

    const balance = balanceData?.balance || 0
    const transactionCount = balanceData?.transactionCount || 0
    const isDeleted = (account as any)?._raw?._status === 'deleted' || (account as any)?._raw?.deleted_at != null

    const handleDelete = () => {
        const hasTransactions = transactionCount > 0;
        const message = hasTransactions
            ? `This account has ${transactionCount} transaction(s). Deleting it will orphan these transactions. Are you sure?`
            : 'Are you sure you want to delete this account? This action cannot be undone.';

        showConfirmationAlert(
            'Delete Account',
            message,
            async () => {
                try {
                    await accountRepository.delete(account!);
                    showSuccessAlert('Deleted', 'Account has been deleted.');
                    router.push('/(tabs)/accounts' as any);
                } catch (error) {
                    console.error('Failed to delete account:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not delete account: ${errorMessage}`);
                }
            }
        );
    };

    const handleRecover = async () => {
        showConfirmationAlert(
            'Recover Account',
            'This will restore the deleted account. Continue?',
            async () => {
                try {
                    await accountRepository.recover(accountId);
                    showSuccessAlert('Recovered', 'Account has been restored.');
                    router.replace(`/account-details?accountId=${accountId}` as any);
                } catch (error) {
                    console.error('Failed to recover account:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not recover account: ${errorMessage}`);
                }
            }
        );
    };

    const HeaderActions = (
        <View style={styles.headerActions}>
            {isDeleted ? (
                <IconButton
                    name="refresh-outline"
                    onPress={handleRecover}
                    variant="surface"
                    iconColor={theme.income}
                />
            ) : (
                <>
                    <IconButton
                        name="create-outline"
                        onPress={() => router.push(`/account-creation?accountId=${accountId}` as any)}
                        variant="surface"
                        iconColor={theme.text}
                    />
                    <IconButton
                        name="trash-outline"
                        onPress={handleDelete}
                        variant="surface"
                        iconColor={theme.error}
                    />
                </>
            )}
        </View>
    );

    if (accountLoading) {
        return (
            <Screen title="Details">
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            </Screen>
        )
    }

    if (!account) {
        return (
            <Screen title="Details">
                <View style={styles.errorContainer}>
                    <AppText variant="body" color="error">
                        Account not found
                    </AppText>
                    <AppButton variant="outline" onPress={() => router.back()}>
                        Go Back
                    </AppButton>
                </View>
            </Screen>
        )
    }

    const renderHeader = () => (
        <View style={styles.headerListRegion}>
            {/* Account Info Card */}
            <AppCard elevation="sm" style={styles.accountInfoCard}>
                <View style={styles.accountHeader}>
                    <IvyIcon
                        label={account!.name}
                        color={account!.accountType.toLowerCase() === 'liability' ? theme.liability : (account!.accountType.toLowerCase() === 'expense' ? theme.expense : theme.asset)}
                        size={48}
                    />
                    <View style={styles.titleInfo}>
                        <AppText variant="title">
                            {account!.name}
                        </AppText>
                        <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                            <Badge variant={account!.accountType.toLowerCase() as any}>
                                {account!.accountType}
                            </Badge>
                            {isDeleted && (
                                <Badge variant="expense">
                                    DELETED
                                </Badge>
                            )}
                        </View>
                    </View>
                </View>

                <View style={styles.accountStats}>
                    <View style={styles.statItem}>
                        <AppText variant="caption" color="secondary">
                            Current Balance
                        </AppText>
                        <AppText variant="heading">
                            {balanceLoading ? '...' : CurrencyFormatter.format(balance, account!.currencyCode)}
                        </AppText>
                    </View>

                    <View style={styles.statItem}>
                        <AppText variant="caption" color="secondary">
                            Transactions
                        </AppText>
                        <AppText variant="subheading">
                            {balanceLoading ? '...' : transactionCount}
                        </AppText>
                    </View>
                </View>

                <View style={[styles.accountMeta, { borderTopWidth: 1, borderTopColor: theme.border }]}>
                    <TouchableOpacity
                        style={styles.historyLink}
                        onPress={() => router.push(`/audit-log?entityType=account&entityId=${accountId}` as any)}
                    >
                        <AppText variant="caption" color="primary" weight="semibold">View Edit History</AppText>
                        <Ionicons name="chevron-forward" size={14} color={theme.primary} />
                    </TouchableOpacity>
                </View>
            </AppCard>

            {/* Transaction History Header */}
            <AppText variant="heading" style={styles.sectionTitle}>
                Transaction History
            </AppText>
        </View>
    );

    return (
        <Screen
            title="Account Details"
            headerActions={HeaderActions}
        >
            <FlatList
                data={transactions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <TransactionItem
                        transaction={item as any}
                        onPress={() => router.push(`/transaction-details?journalId=${item.journalId}` as any)}
                    />
                )}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={
                    transactionsLoading ? (
                        <View style={{ padding: Spacing.lg }}>
                            <ActivityIndicator size="small" color={theme.primary} />
                        </View>
                    ) : (
                        <AppCard elevation="sm" padding="lg">
                            <AppText variant="body" color="secondary" style={styles.emptyText}>
                                No transactions yet
                            </AppText>
                        </AppCard>
                    )
                }
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
            />

            {!isDeleted && (
                <FloatingActionButton
                    onPress={() => router.push(`/journal-entry?sourceId=${accountId}` as any)}
                />
            )}
        </Screen>
    )
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.lg,
        padding: Spacing.lg,
    },
    headerActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    headerListRegion: {
        paddingVertical: Spacing.md,
    },
    accountInfoCard: {
        marginBottom: Spacing.lg,
        padding: Spacing.lg,
        borderRadius: Shape.radius.xl,
    },
    accountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    titleInfo: {
        marginLeft: Spacing.md,
        flex: 1,
        gap: Spacing.xs,
    },
    accountStats: {
        flexDirection: 'row',
        gap: Spacing.xl,
        marginBottom: Spacing.md,
        paddingVertical: Spacing.md,
    },
    statItem: {
        flex: 1,
    },
    accountMeta: {
        gap: Spacing.xs,
        paddingTop: Spacing.md,
    },
    historyLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginTop: Spacing.sm,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
    },
    emptyText: {
        textAlign: 'center',
    },
    listContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 100, // Space for FAB
    },
})
