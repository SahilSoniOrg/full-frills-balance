/**
 * Account Details Screen
 * 
 * Shows account information and transaction history
 */

import { AppButton, AppCard, AppText, Badge } from '@/components/core'
import { Spacing } from '@/constants'
import { useAccount, useAccountBalance, useAccountTransactions } from '@/hooks/use-data'
import { useTheme } from '@/hooks/use-theme'
import { TransactionType } from '@/src/data/models/Transaction'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function AccountDetailsScreen() {
    const router = useRouter()
    const params = useLocalSearchParams()
    const { theme, themeMode } = useTheme()
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
                    <AppText variant="body" color="error" themeMode={themeMode}>
                        Account not found
                    </AppText>
                    <AppButton variant="outline" onPress={() => router.back()} themeMode={themeMode}>
                        Go Back
                    </AppButton>
                </View>
            </SafeAreaView>
        )
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <AppText variant="subheading" themeMode={themeMode}>
                    Account Details
                </AppText>
                <View style={styles.placeholder} />
            </View>

            {/* Account Info Card */}
            <AppCard elevation="md" padding="lg" style={styles.accountInfoCard} themeMode={themeMode}>
                <View style={styles.accountHeader}>
                    <AppText variant="title" themeMode={themeMode}>
                        {account.name}
                    </AppText>
                    <Badge variant={account.accountType.toLowerCase() as any} themeMode={themeMode}>
                        {account.accountType}
                    </Badge>
                </View>

                <View style={styles.accountStats}>
                    <View style={styles.statItem}>
                        <AppText variant="caption" color="secondary" themeMode={themeMode}>
                            Current Balance
                        </AppText>
                        <AppText variant="heading" themeMode={themeMode}>
                            {balanceLoading ? '...' : `${balance.toFixed(2)} ${account.currencyCode}`}
                        </AppText>
                    </View>

                    <View style={styles.statItem}>
                        <AppText variant="caption" color="secondary" themeMode={themeMode}>
                            Transactions
                        </AppText>
                        <AppText variant="subheading" themeMode={themeMode}>
                            {balanceLoading ? '...' : transactionCount}
                        </AppText>
                    </View>
                </View>

                <View style={styles.accountMeta}>
                    <AppText variant="caption" color="secondary" themeMode={themeMode}>
                        Created: {new Date(account.createdAt).toLocaleDateString()}
                    </AppText>
                    {account.description && (
                        <AppText variant="body" themeMode={themeMode} style={styles.description}>
                            {account.description}
                        </AppText>
                    )}
                </View>
            </AppCard>

            {/* Transaction History */}
            <View style={styles.transactionsSection}>
                <AppText variant="heading" themeMode={themeMode} style={styles.sectionTitle}>
                    Transaction History
                </AppText>

                {transactionsLoading ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                ) : transactions.length === 0 ? (
                    <AppCard elevation="sm" padding="lg" themeMode={themeMode}>
                        <AppText variant="body" color="secondary" themeMode={themeMode} style={styles.emptyText}>
                            No transactions yet
                        </AppText>
                    </AppCard>
                ) : (
                    <FlatList
                        data={transactions}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <AppCard elevation="sm" padding="md" style={styles.transactionCard} themeMode={themeMode}>
                                <View style={styles.transactionRow}>
                                    <View style={styles.transactionInfo}>
                                        <AppText variant="body" themeMode={themeMode}>
                                            {item.transactionType === TransactionType.DEBIT ? '+ ' : '- '}
                                            {item.amount.toFixed(2)} {item.currencyCode}
                                        </AppText>
                                        {item.exchangeRate && (
                                            <AppText variant="caption" color="secondary" themeMode={themeMode}>
                                                Rate: {item.exchangeRate.toFixed(4)}
                                            </AppText>
                                        )}
                                        {item.notes && (
                                            <AppText variant="caption" color="secondary" themeMode={themeMode}>
                                                {item.notes}
                                            </AppText>
                                        )}
                                    </View>
                                    <AppText variant="caption" color="secondary" themeMode={themeMode}>
                                        {new Date(item.transactionDate).toLocaleDateString()}
                                    </AppText>
                                </View>
                            </AppCard>
                        )}
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
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: Spacing.sm,
    },
    placeholder: {
        width: 32,
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
    },
    accountHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
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
