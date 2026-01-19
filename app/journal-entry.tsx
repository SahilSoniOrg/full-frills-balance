import { AppText } from '@/components/core';
import { ThemeMode, useThemeColors } from '@/constants';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { showErrorAlert } from '@/src/utils/alerts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountSelector } from '../components/journal/AccountSelector';
import { AdvancedJournalForm } from '../components/journal/AdvancedJournalForm';
import { JournalEntryHeader } from '../components/journal/JournalEntryHeader';
import { JournalEntryLine } from '../components/journal/JournalLineItem';
import { JournalModeToggle } from '../components/journal/JournalModeToggle';
import SimpleJournalForm from '../components/journal/SimpleJournalForm';
import { useUser } from '../contexts/UIContext';

export default function JournalEntryScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const { themePreference } = useUser()
  const colorScheme = useColorScheme()
  const themeMode: ThemeMode = themePreference === 'system'
    ? (colorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode
  const theme = useThemeColors(themeMode)

  // Guided mode state
  const [isGuidedMode, setIsGuidedMode] = useState(true)
  const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>('expense')

  // Advanced mode state
  const [lines, setLines] = useState<JournalEntryLine[]>([
    { id: '1', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.DEBIT, notes: '', exchangeRate: '' },
    { id: '2', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.CREDIT, notes: '', exchangeRate: '' },
  ])
  const [accounts, setAccounts] = useState<any[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)

  // Handle URL parameters
  useEffect(() => {
    if (params.mode === 'simple') {
      setIsGuidedMode(true)
    } else if (params.mode === 'advanced') {
      setIsGuidedMode(false)
    }

    if (params.type === 'income' || params.type === 'expense' || params.type === 'transfer') {
      setTransactionType(params.type as 'income' | 'expense' | 'transfer')
    }
  }, [params.mode, params.type])

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      const allAccounts = await accountRepository.findAll()
      setAccounts(allAccounts)
    } catch (error) {
      console.error('Failed to load accounts:', error)
      showErrorAlert('Failed to load accounts')
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  const selectAccount = (accountId: string) => {
    if (!selectedLineId) return

    const account = accounts.find(acc => acc.id === accountId)
    if (account) {
      const updatedLine = {
        accountId: accountId,
        accountName: account.name,
        accountType: account.accountType,
        accountCurrency: account.currencyCode
      }

      setLines(lines.map(line =>
        line.id === selectedLineId ? { ...line, ...updatedLine } : line
      ))
    }
    setShowAccountPicker(false)
    setSelectedLineId(null)
  }

  if (isLoadingAccounts) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <AppText variant="body" themeMode={themeMode}>Loading accounts...</AppText>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <JournalEntryHeader
        title={isGuidedMode ? 'New Transaction' : 'Journal Entry'}
        theme={theme}
        themeMode={themeMode}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <JournalModeToggle
          isGuidedMode={isGuidedMode}
          setIsGuidedMode={setIsGuidedMode}
          theme={theme}
          themeMode={themeMode}
        />

        {isGuidedMode ? (
          <SimpleJournalForm
            accounts={accounts}
            themeMode={themeMode}
            onSuccess={() => router.push('/(tabs)')}
            initialType={transactionType}
          />
        ) : (
          <AdvancedJournalForm
            accounts={accounts}
            theme={theme}
            themeMode={themeMode}
            onSuccess={() => router.push('/(tabs)')}
            onSelectAccountRequest={(id) => {
              setSelectedLineId(id)
              setShowAccountPicker(true)
            }}
            lines={lines}
            setLines={setLines}
          />
        )}
      </ScrollView>

      <AccountSelector
        visible={showAccountPicker}
        accounts={accounts}
        themeMode={themeMode}
        onClose={() => setShowAccountPicker(false)}
        onSelect={selectAccount}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
});
