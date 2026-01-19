/**
 * Account Details Screen
 * 
 * Shows account information and transaction history
 */

import { AppButton, AppCard, AppText, Badge, IvyIcon } from '@/components/core'
import { TransactionItem } from '@/components/journal/TransactionItem'
import { Shape, Spacing } from '@/constants'
import { useAccount, useAccountBalance, useAccountTransactions } from '@/hooks/use-data'
import { useTheme } from '@/hooks/use-theme'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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

    if (accountLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            </SafeAreaView>
        )
    }

    if (!account) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={styles.errorContainer}>
                    <AppText variant="body" color="error">
                        Account not found
                    </AppText>
                    <AppButton variant="outline" onPress={() => router.back()}>
                        Go Back
                    </AppButton>
                </View>
            </SafeAreaView>
        )
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.circularButton, { backgroundColor: theme.surface }]}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <AppText variant="subheading" style={styles.headerTitle}>
                    Account Details
                </AppText>
                <View style={styles.placeholder} />
            </View>

            {/* Account Info Card */}
            <AppCard elevation="sm" style={styles.accountInfoCard}>
                <View style={styles.accountHeader}>
                    <IvyIcon
                        label={account.name}
                        color={account.accountType.toLowerCase() === 'liability' ? theme.liability : (account.accountType.toLowerCase() === 'expense' ? theme.expense : theme.asset)}
                        size={48}
                    />
                    <View style={styles.titleInfo}>
                        <AppText variant="title">
                            {account.name}
                        </AppText>
                        <Badge variant={account.accountType.toLowerCase() as any}>
                            {account.accountType}
                        </Badge>
                    </View>
                </View>

                <View style={styles.accountStats}>
                    <View style={styles.statItem}>
                        <AppText variant="caption" color="secondary">
                            Current Balance
                        </AppText>
                        <AppText variant="heading">
                            {balanceLoading ? '...' : CurrencyFormatter.format(balance, account.currencyCode)}
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

            {/* Transaction History */}
            <View style={styles.transactionsSection}>
                <AppText variant="heading" style={styles.sectionTitle}>
                    Transaction History
                </AppText>

                {transactionsLoading ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                ) : transactions.length === 0 ? (
                    <AppCard elevation="sm" padding="lg">
                        <AppText variant="body" color="secondary" style={styles.emptyText}>
                            No transactions yet
                        </AppText>
                    </AppCard>
                ) : (
                    <FlatList
                        data={transactions}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <TransactionItem
                                transaction={item as any}
                            />
                        )}
                        contentContainerStyle={{ paddingBottom: Spacing.xl }}
                    />
                )}
            </View>
        </SafeAreaView>
    )
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
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    circularButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholder: {
        width: 40,
    },
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
    accountInfoCard: {
        margin: Spacing.lg,
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
        gap: 4,
        marginTop: Spacing.sm,
    },
    description: {
        marginTop: Spacing.xs,
    },
    transactionsSection: {
        flex: 1,
        paddingHorizontal: Spacing.lg,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
    },
    transactionCard: {
        marginBottom: Spacing.sm,
    },
    transactionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    transactionInfo: {
        flex: 1,
        gap: Spacing.xs,
    },
    emptyText: {
        textAlign: 'center',
    },
})
