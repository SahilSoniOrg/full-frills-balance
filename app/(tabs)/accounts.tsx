import type { AppTextProps, BadgeProps } from '@/components/core'
import { AppButton, AppCard, AppText, Badge } from '@/components/core'
import { Spacing, ThemeMode, useThemeColors } from '@/constants'
import { useUser } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useAccountBalance, useAccounts } from '@/hooks/use-data'
import Account, { AccountType } from '@/src/data/models/Account'
import { useRouter } from 'expo-router'
import React from 'react'
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native'

interface AccountItemProps {
  account: Account
  themeMode: ThemeMode
  onPress: (account: Account, balance: number, transactionCount: number) => void
}

const AccountItem = ({ account, themeMode, onPress }: AccountItemProps) => {
  const { balanceData, isLoading } = useAccountBalance(account.id)
  const theme = useThemeColors(themeMode)

  const getAccountTypeVariant = (type: AccountType): BadgeProps['variant'] => {
    switch (type) {
      case AccountType.ASSET: return 'asset'
      case AccountType.LIABILITY: return 'liability'
      case AccountType.EQUITY: return 'equity'
      case AccountType.INCOME: return 'income'
      case AccountType.EXPENSE: return 'expense'
      default: return 'default'
    }
  }

  const getBalanceColor = (balance: number, accountType: AccountType, transactionCount: number): AppTextProps['color'] => {
    if (Math.abs(balance) < 0.01 && transactionCount === 0) return 'secondary'
    if (Math.abs(balance) < 0.01 && transactionCount > 0) return 'success'
    const isNegativeBalance = balance < 0
    const shouldBeNegative = [AccountType.LIABILITY, AccountType.EQUITY, AccountType.INCOME].includes(accountType)
    return isNegativeBalance === shouldBeNegative ? 'success' : 'error'
  }

  const balance = balanceData?.balance || 0
  const transactionCount = balanceData?.transactionCount || 0

  return (
    <TouchableOpacity onPress={() => onPress(account, balance, transactionCount)}>
      <AppCard elevation="sm" padding="lg" style={styles.accountCard} themeMode={themeMode}>
        <View style={styles.accountHeader}>
          <AppText variant="subheading" themeMode={themeMode}>{account.name}</AppText>
          <Badge variant={getAccountTypeVariant(account.accountType)} themeMode={themeMode}>
            {account.accountType}
          </Badge>
        </View>
        <View style={styles.accountDetails}>
          <AppText variant="body" color="secondary" themeMode={themeMode}>
            {account.currencyCode}
          </AppText>
          <AppText
            variant="title"
            color={getBalanceColor(balance, account.accountType, transactionCount)}
            themeMode={themeMode}
          >
            {isLoading ? '...' : balance.toFixed(2)}
          </AppText>
          <AppText variant="caption" color="secondary" themeMode={themeMode}>
            {isLoading ? '...' : `${transactionCount} transactions`}
          </AppText>
        </View>
      </AppCard>
    </TouchableOpacity>
  )
}

export default function AccountsScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()
  const { accounts, isLoading } = useAccounts()

  const themeMode: ThemeMode = themePreference === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode

  const theme = useThemeColors(themeMode)

  const handleAccountPress = (account: Account, balance: number, transactionCount: number) => {
    const formattedDate = new Date(account.createdAt).toLocaleDateString()
    const message = `Type: ${account.accountType}\nCurrency: ${account.currencyCode}\nCurrent Balance: ${balance.toFixed(2)}\nTransactions: ${transactionCount}\nCreated: ${formattedDate}`
    alert(`${account.name}\n\n${message}`)
    // router.push({ pathname: '/account-details', params: { id: account.id } })
  }

  const handleCreateJournal = () => {
    router.push('/journal-entry' as any)
  }

  const handleViewJournals = () => {
    router.push('/journal-list' as any)
  }

  const handleCreateAccount = () => {
    router.push('/account-creation' as any)
  }

  return (
    <View style={styles.container}>
      <View style={[styles.headerButtons, { padding: Spacing.lg, backgroundColor: theme.background }]}>
        <AppButton
          variant="primary"
          onPress={handleCreateAccount}
          themeMode={themeMode}
        >
          + Account
        </AppButton>
        <AppButton
          variant="secondary"
          onPress={handleCreateJournal}
          themeMode={themeMode}
        >
          + Journal
        </AppButton>
        <AppButton
          variant="outline"
          onPress={handleViewJournals}
          themeMode={themeMode}
        >
          📋 View All
        </AppButton>
      </View>

      {accounts.length === 0 ? (
        <View style={styles.emptyState}>
          <AppText variant="body" color="secondary" themeMode={themeMode}>
            No accounts yet. Create your first account to get started!
          </AppText>
        </View>
      ) : (
        <FlatList
          data={accounts}
          renderItem={({ item }) => (
            <AccountItem
              account={item}
              themeMode={themeMode}
              onPress={handleAccountPress}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
  },
  accountCard: {
    marginBottom: Spacing.md,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  accountDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
