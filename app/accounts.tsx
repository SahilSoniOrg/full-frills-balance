import Account, { AccountType } from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { showErrorAlert } from '@/src/utils/alerts'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface AccountWithBalance {
  account: Account
  balance: number
  transactionCount: number
}

export default function AccountsScreen() {
  const router = useRouter()
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

  const getAccountTypeColor = (type: AccountType) => {
    switch (type) {
      case AccountType.ASSET:
        return '#007AFF'
      case AccountType.LIABILITY:
        return '#FF6B6B'
      case AccountType.EQUITY:
        return '#10B981'
      case AccountType.INCOME:
        return '#059669'
      case AccountType.EXPENSE:
        return '#DC3545'
      default:
        return '#666'
    }
  }

  const getBalanceColor = (balance: number, accountType: AccountType, transactionCount: number) => {
    // Special handling for zero balance accounts
    if (Math.abs(balance) < 0.01 && transactionCount === 0) {
      return '#666' // Gray for truly empty accounts
    }
    if (Math.abs(balance) < 0.01 && transactionCount > 0) {
      return '#10B981' // Green for reconciled zero balance
    }
    
    // For assets and expenses, positive is normal (green), negative is warning (red)
    // For liabilities, equity, and income, negative is normal (green), positive is warning (red)
    const isNegativeBalance = balance < 0
    const shouldBeNegative = [AccountType.LIABILITY, AccountType.EQUITY, AccountType.INCOME].includes(accountType)
    
    if (isNegativeBalance === shouldBeNegative) {
      return '#10B981' // Green - normal state
    } else {
      return '#EF4444' // Red - unusual state
    }
  }

  const renderAccount = ({ item }: { item: AccountWithBalance }) => (
    <TouchableOpacity 
      style={styles.accountCard}
      onPress={() => handleAccountPress(item)}
    >
      <View style={styles.accountHeader}>
        <Text style={styles.accountName}>{item.account.name}</Text>
        <View style={[styles.accountTypeBadge, { backgroundColor: getAccountTypeColor(item.account.accountType) }]}>
          <Text style={styles.accountTypeText}>{item.account.accountType}</Text>
        </View>
      </View>
      <View style={styles.accountDetails}>
        <Text style={styles.accountCurrency}>{item.account.currencyCode}</Text>
        <Text style={[styles.accountBalance, { color: getBalanceColor(item.balance, item.account.accountType, item.transactionCount) }]}>
          {item.balance.toFixed(2)}
        </Text>
        <Text style={styles.transactionCount}>{item.transactionCount} transactions</Text>
      </View>
    </TouchableOpacity>
  )

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading accounts...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Accounts</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={[styles.headerButton, styles.createButton]}
            onPress={handleCreateAccount}
          >
            <Text style={styles.headerButtonText}>+ Account</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerButton, styles.journalButton]}
            onPress={handleCreateJournal}
          >
            <Text style={styles.headerButtonText}>+ Journal</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerButton, styles.journalListButton]}
            onPress={handleViewJournals}
          >
            <Text style={styles.headerButtonText}>📋 View All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {accountsWithBalances.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No accounts yet. Create your first account to get started!
          </Text>
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
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  journalButton: {
    backgroundColor: '#10B981',
  },
  journalListButton: {
    backgroundColor: '#8B5CF6',
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  listContainer: {
    paddingHorizontal: 24,
  },
  accountCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  accountTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  accountTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  accountDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountCurrency: {
    fontSize: 14,
    color: '#666',
  },
  accountBalance: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  transactionCount: {
    fontSize: 12,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
})
