import type { AppTextProps, BadgeProps } from '@/components/core'
import { AppButton, AppCard, AppText, Badge } from '@/components/core'
import { Spacing, ThemeMode, useThemeColors } from '@/constants'
import { useUser } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'
import Account, { AccountType } from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { showErrorAlert } from '@/src/utils/alerts'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface AccountWithBalance {
  account: Account
  balance: number
  transactionCount: number
}

export default function AccountsScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()
  
  // Derive theme mode following the explicit pattern from design preview
  const themeMode: ThemeMode = themePreference === 'system' 
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode
  
  const theme = useThemeColors(themeMode)
  const [accountsWithBalances, setAccountsWithBalances] = useState<AccountWithBalance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAccountsWithBalances = async () => {
      try {
        const userAccounts = await accountRepository.findAll()
        
        // Get balances for all accounts
        const accountsWithBalanceData = await Promise.all(
          userAccounts.map(async (account) => {
            const balanceData = await accountRepository.getAccountBalance(account.id)
            return {
              account,
              balance: balanceData.balance,
              transactionCount: balanceData.transactionCount
            }
          })
        )
        
        setAccountsWithBalances(accountsWithBalanceData)
      } catch (error) {
        showErrorAlert(error, 'Failed to Load Accounts')
        setAccountsWithBalances([]) // Clear data on error
      } finally {
        setIsLoading(false)
      }
    }

    loadAccountsWithBalances()
  }, [])

  const handleCreateJournal = () => {
    router.push('/journal-entry' as any)
  }

  const handleViewJournals = () => {
    router.push('/journal-list' as any)
  }

  const handleCreateAccount = () => {
    router.push('/account-creation' as any)
  }

  const handleAccountPress = (accountWithBalance: AccountWithBalance) => {
    const { account, balance, transactionCount } = accountWithBalance
    const formattedDate = new Date(account.createdAt).toLocaleDateString()
    const message = `Type: ${account.accountType}\nCurrency: ${account.currencyCode}\nCurrent Balance: ${balance.toFixed(2)}\nTransactions: ${transactionCount}\nCreated: ${formattedDate}`
    alert(`${account.name}\n\n${message}`)
  }

  const getAccountTypeVariant = (type: AccountType): BadgeProps['variant'] => {
    switch (type) {
      case AccountType.ASSET:
        return 'asset'
      case AccountType.LIABILITY:
        return 'liability'
      case AccountType.EQUITY:
        return 'equity'
      case AccountType.INCOME:
        return 'income'
      case AccountType.EXPENSE:
        return 'expense'
      default:
        return 'default'
    }
  }

  const getBalanceColor = (balance: number, accountType: AccountType, transactionCount: number): AppTextProps['color'] => {
    // Special handling for zero balance accounts
    if (Math.abs(balance) < 0.01 && transactionCount === 0) {
      return 'secondary' // Gray for truly empty accounts
    }
    if (Math.abs(balance) < 0.01 && transactionCount > 0) {
      return 'success' // Green for reconciled zero balance
    }
    
    // For assets and expenses, positive is normal (green), negative is warning (red)
    // For liabilities, equity, and income, negative is normal (green), positive is warning (red)
    const isNegativeBalance = balance < 0
    const shouldBeNegative = [AccountType.LIABILITY, AccountType.EQUITY, AccountType.INCOME].includes(accountType)
    
    if (isNegativeBalance === shouldBeNegative) {
      return 'success' // Green - normal state
    } else {
      return 'error' // Red - unusual state
    }
  }

  const renderAccount = ({ item }: { item: AccountWithBalance }) => (
    <TouchableOpacity 
      onPress={() => handleAccountPress(item)}
    >
      <AppCard elevation="sm" padding="lg" style={styles.accountCard} themeMode={themeMode}>
        <View style={styles.accountHeader}>
          <AppText variant="subheading" themeMode={themeMode}>{item.account.name}</AppText>
          <Badge variant={getAccountTypeVariant(item.account.accountType)} themeMode={themeMode}>
            {item.account.accountType}
          </Badge>
        </View>
        <View style={styles.accountDetails}>
          <AppText variant="body" color="secondary" themeMode={themeMode}>
            {item.account.currencyCode}
          </AppText>
          <AppText 
            variant="title" 
            color={getBalanceColor(item.balance, item.account.accountType, item.transactionCount)} 
            themeMode={themeMode}
          >
            {item.balance.toFixed(2)}
          </AppText>
          <AppText variant="caption" color="secondary" themeMode={themeMode}>
            {item.transactionCount} transactions
          </AppText>
        </View>
      </AppCard>
    </TouchableOpacity>
  )

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <AppText variant="body" themeMode={themeMode}>Loading accounts...</AppText>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppCard elevation="none" padding="lg" style={styles.header} themeMode={themeMode}>
        <AppText variant="title" themeMode={themeMode}>Your Accounts</AppText>
        <View style={styles.headerButtons}>
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
      </AppCard>

      {accountsWithBalances.length === 0 ? (
        <View style={styles.emptyState}>
          <AppText variant="body" color="secondary" themeMode={themeMode}>
            No accounts yet. Create your first account to get started!
          </AppText>
        </View>
      ) : (
        <FlatList
          data={accountsWithBalances}
          renderItem={renderAccount}
          keyExtractor={(item) => item.account.id}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </SafeAreaView>
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
