import { AppButton, AppText, FloatingActionButton } from '@/components/core'
import { AccountCard } from '@/components/journal/AccountCard'
import { Spacing, ThemeMode, useThemeColors } from '@/constants'
import { useUser } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useAccounts } from '@/hooks/use-data'
import Account from '@/src/data/models/Account'
import { useRouter } from 'expo-router'
import React from 'react'
import { FlatList, StyleSheet, View } from 'react-native'

// AccountItem replaced by AccountCard

export default function AccountsScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()
  const { accounts, isLoading } = useAccounts()

  const themeMode: ThemeMode = themePreference === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode

  const theme = useThemeColors(themeMode)

  const handleAccountPress = (account: Account) => {
    router.push(`/account-details?accountId=${account.id}` as any)
  }

  const handleCreateJournal = () => {
    router.push('/journal-entry' as any)
  }

  const handleViewJournals = () => {
    router.push('/(tabs)')
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
            <AccountCard
              account={item}
              themeMode={themeMode}
              onPress={handleAccountPress}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}
      <FloatingActionButton
        onPress={() => router.push('/journal-entry' as any)}
      />
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
