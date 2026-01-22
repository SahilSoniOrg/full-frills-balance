import { AppText, Badge } from '@/components/core';
import { useTheme } from '@/hooks/use-theme';
import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { showErrorAlert } from '@/src/utils/alerts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountSelector } from '../components/journal/AccountSelector';
import { AdvancedJournalForm } from '../components/journal/AdvancedJournalForm';
import { JournalEntryHeader } from '../components/journal/JournalEntryHeader';
import { JournalEntryLine } from '../components/journal/JournalLineItem';
import { JournalModeToggle } from '../components/journal/JournalModeToggle';
import SimpleJournalForm from '../components/journal/SimpleJournalForm';

export default function JournalEntryScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const { theme } = useTheme()

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

  // Edit mode state
  const [initialDescription, setInitialDescription] = useState('')
  const [initialDate, setInitialDate] = useState(new Date().toISOString().split('T')[0])
  const [isEdit, setIsEdit] = useState(false)

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

    if (params.journalId) {
      setIsEdit(true)
      setIsGuidedMode(false) // Always use advanced mode for editing existing journals for now
      loadJournalData(params.journalId as string)
    }
  }, [params.mode, params.type, params.journalId])

  const loadJournalData = async (id: string) => {
    try {
      const journal = await database.collections.get('journals').find(id)
      if (journal) {
        const j = journal as any
        setInitialDescription(j.description || '')
        setInitialDate(new Date(j.journalDate).toISOString().split('T')[0])

        const txs = await transactionRepository.findByJournalWithAccountInfo(id)
        if (txs.length > 0) {
          setLines(txs.map(tx => ({
            id: tx.id,
            accountId: tx.accountId,
            accountName: tx.accountName,
            accountType: tx.accountType || AccountType.ASSET,
            amount: tx.amount.toString(),
            transactionType: tx.transactionType,
            notes: tx.notes || '',
            exchangeRate: tx.exchangeRate ? tx.exchangeRate.toString() : '',
            accountCurrency: tx.currencyCode
          })))
        }
      }
    } catch (error) {
      console.error('Failed to load journal data:', error)
      showErrorAlert('Failed to load transaction for editing')
    }
  }

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
          <AppText variant="body">Loading accounts...</AppText>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <JournalEntryHeader
        title={isEdit ? 'Edit Transaction' : (isGuidedMode ? 'New Transaction' : 'Journal Entry')}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {isEdit && (
            <View style={[styles.editBanner, { backgroundColor: theme.warning + '20' }]}>
              <Badge variant="expense" size="sm">EDITING</Badge>
              <AppText variant="caption" color="secondary" style={{ marginLeft: 8 }}>
                You are modifying an existing transaction
              </AppText>
            </View>
          )}
          {!isEdit && (
            <JournalModeToggle
              isGuidedMode={isGuidedMode}
              setIsGuidedMode={setIsGuidedMode}
            />
          )}

          {isGuidedMode ? (
            <SimpleJournalForm
              accounts={accounts}
              onSuccess={() => router.back()}
              initialType={transactionType}
            />
          ) : (
            <AdvancedJournalForm
              accounts={accounts}
              onSuccess={() => router.back()}
              onSelectAccountRequest={(id) => {
                setSelectedLineId(id)
                setShowAccountPicker(true)
              }}
              lines={lines}
              setLines={setLines}
              initialDescription={initialDescription}
              initialDate={initialDate}
              isEdit={isEdit}
              journalId={params.journalId as string}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <AccountSelector
        visible={showAccountPicker}
        accounts={accounts}
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
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
});
