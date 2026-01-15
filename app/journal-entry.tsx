import { ThemedText } from '@/components/legacy/themed-text';
import { ThemedView } from '@/components/legacy/themed-view';
import { AppConfig } from '@/constants';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { sanitizeAmount } from '@/src/utils/validation';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '../contexts/UIContext';

interface JournalEntryLine {
  id: string;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  amount: string;
  transactionType: TransactionType;
  notes: string;
}

export default function JournalEntryScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const colorScheme = useColorScheme()
  
  // Theme colors
  const backgroundColor = useThemeColor({}, 'background')
  const textColor = useThemeColor({}, 'text')
  const borderColor = useThemeColor({ light: '#e9ecef', dark: '#333' }, 'background')
  const cardBackground = useThemeColor({ light: '#f8f9fa', dark: '#1a1a1a' }, 'background')
  const inputBackground = useThemeColor({ light: '#fff', dark: '#2a2a2a' }, 'background')
  
  const [description, setDescription] = useState('')
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0])
  const [lines, setLines] = useState<JournalEntryLine[]>([
    { id: '1', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.DEBIT, notes: '' },
    { id: '2', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.CREDIT, notes: '' },
  ])
  const [accounts, setAccounts] = useState<any[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const userAccounts = await accountRepository.findAll()
        setAccounts(userAccounts)
      } catch (error) {
        showErrorAlert(error, 'Failed to Load Accounts')
      } finally {
        setIsLoadingAccounts(false)
      }
    }

    loadAccounts()
  }, [])

  const addLine = () => {
    const newLine: JournalEntryLine = {
      id: Date.now().toString(),
      accountId: '',
      accountName: '',
      accountType: AccountType.ASSET,
      amount: '',
      transactionType: TransactionType.DEBIT,
      notes: '',
    }
    setLines([...lines, newLine])
  }

  const removeLine = (id: string) => {
    if (lines.length > 2) {
      setLines(lines.filter(line => line.id !== id))
    } else {
      Alert.alert('Cannot Remove', 'A journal must have at least 2 lines')
    }
  }

  const updateLine = (id: string, updates: Partial<JournalEntryLine>) => {
    setLines(lines.map(line => 
      line.id === id ? { ...line, ...updates } : line
    ))
  }

  const selectAccount = (lineId: string, account: Account) => {
    updateLine(lineId, {
      accountId: account.id,
      accountName: account.name,
      accountType: account.accountType,
    })
  }

  const openAccountPicker = (lineId: string) => {
    setSelectedLineId(lineId)
    setShowAccountPicker(true)
  }

  const closeAccountPicker = () => {
    setShowAccountPicker(false)
    setSelectedLineId(null)
  }

  const handleAccountSelect = (account: Account) => {
    if (selectedLineId) {
      selectAccount(selectedLineId, account)
    }
    closeAccountPicker()
  }

  const validateJournal = (): { isValid: boolean; error?: string } => {
    // Check if all lines have accounts and amounts
    for (const line of lines) {
      if (!line.accountId) {
        return { isValid: false, error: 'All lines must have an account selected' }
      }
      
      if (!line.amount.trim()) {
        return { isValid: false, error: 'All lines must have an amount' }
      }
      
      const amount = sanitizeAmount(line.amount)
      if (amount === null || amount <= 0) {
        return { isValid: false, error: 'All amounts must be positive numbers' }
      }
    }

    // Calculate totals
    const totalDebits = lines
      .filter(line => line.transactionType === TransactionType.DEBIT)
      .reduce((sum, line) => sum + (sanitizeAmount(line.amount) || 0), 0)
    
    const totalCredits = lines
      .filter(line => line.transactionType === TransactionType.CREDIT)
      .reduce((sum, line) => sum + (sanitizeAmount(line.amount) || 0), 0)

    // Check if balanced
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return { 
        isValid: false, 
        error: `Journal must balance: Debits (${totalDebits.toFixed(2)}) ≠ Credits (${totalCredits.toFixed(2)})` 
      }
    }

    return { isValid: true }
  }

  const handleCreateJournal = async () => {
    const validation = validateJournal()
    if (!validation.isValid) {
      Alert.alert('Validation Error', validation.error)
      return
    }

    setIsCreating(true)
    
    try {
      const journalData: CreateJournalData = {
        journalDate: new Date(journalDate).getTime(),
        description: description.trim() || undefined,
        currencyCode: AppConfig.defaultCurrency,
        transactions: lines.map(line => ({
          accountId: line.accountId,
          amount: sanitizeAmount(line.amount)!,
          transactionType: line.transactionType,
          notes: line.notes.trim() || undefined,
        }))
      }

      await journalRepository.createJournalWithTransactions(journalData)

      showSuccessAlert(
        'Journal Created',
        'Journal entry has been created successfully!'
      )
      
      // Navigate back immediately
      router.back()
      
    } catch (error) {
      showErrorAlert(error, 'Failed to Create Journal')
    } finally {
      setIsCreating(false)
    }
  }

  const getTotalDebits = () => {
    return lines
      .filter(line => line.transactionType === TransactionType.DEBIT)
      .reduce((sum, line) => sum + (sanitizeAmount(line.amount) || 0), 0)
  }

  const getTotalCredits = () => {
    return lines
      .filter(line => line.transactionType === TransactionType.CREDIT)
      .reduce((sum, line) => sum + (sanitizeAmount(line.amount) || 0), 0)
  }

  const isBalanced = Math.abs(getTotalDebits() - getTotalCredits()) < 0.01

  if (isLoadingAccounts) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading accounts...</ThemedText>
        </View>
      </ThemedView>
    )
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Create Journal Entry</ThemedText>
        <TouchableOpacity onPress={() => router.push('/journal-list' as any)} style={styles.listButton}>
          <ThemedText style={styles.listButtonText}>List</ThemedText>
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Create Journal Entry
        </ThemedText>
        
        <View style={styles.inputContainer}>
          <ThemedText style={styles.label}>Date</ThemedText>
          <TextInput
            style={[
              styles.input,
              { 
                borderColor,
                color: textColor,
                backgroundColor: inputBackground,
              }
            ]}
            value={journalDate}
            onChangeText={setJournalDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.inputContainer}>
          <ThemedText style={styles.label}>Description</ThemedText>
          <TextInput
            style={[
              styles.input,
              { 
                borderColor,
                color: textColor,
                backgroundColor: inputBackground,
              }
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            placeholderTextColor="#999"
          />
        </View>

        <ThemedText style={styles.sectionTitle}>Journal Lines</ThemedText>
        
        {lines.map((line, index) => (
          <View key={line.id} style={[styles.lineContainer, { backgroundColor: cardBackground }]}>
            <View style={styles.lineHeader}>
              <ThemedText style={styles.lineNumber}>Line {index + 1}</ThemedText>
              {lines.length > 2 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeLine(line.id)}
                >
                  <ThemedText style={styles.removeButtonText}>Remove</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.lineInputs}>
              <TouchableOpacity
                style={[
                  styles.accountSelector,
                  { 
                    borderColor,
                    backgroundColor: inputBackground,
                  }
                ]}
                onPress={() => openAccountPicker(line.id)}
              >
                <ThemedText style={line.accountName ? styles.accountText : styles.placeholderText}>
                  {line.accountName || 'Select Account'}
                </ThemedText>
              </TouchableOpacity>

              <TextInput
                style={[
                  styles.amountInput,
                  { 
                    borderColor,
                    color: textColor,
                    backgroundColor: inputBackground,
                  }
                ]}
                value={line.amount}
                onChangeText={(value) => updateLine(line.id, { amount: value })}
                placeholder="0.00"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
              />

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  line.transactionType === TransactionType.DEBIT ? styles.debitButton : styles.creditButton,
                  { 
                    borderColor,
                  }
                ]}
                onPress={() => updateLine(line.id, {
                  transactionType: line.transactionType === TransactionType.DEBIT 
                    ? TransactionType.CREDIT 
                    : TransactionType.DEBIT
                })}
              >
                <ThemedText style={[
                  styles.typeButtonText,
                  line.transactionType === TransactionType.DEBIT ? styles.debitText : styles.creditText
                ]}>
                  {line.transactionType}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.notesInput,
                { 
                  borderColor,
                  color: textColor,
                  backgroundColor: inputBackground,
                }
              ]}
              value={line.notes}
              onChangeText={(value) => updateLine(line.id, { notes: value })}
              placeholder="Notes (optional)"
              placeholderTextColor="#999"
            />
          </View>
        ))}

        <TouchableOpacity style={styles.addLineButton} onPress={addLine}>
          <ThemedText style={styles.addLineButtonText}>+ Add Line</ThemedText>
        </TouchableOpacity>

        <View style={[styles.totalsContainer, { backgroundColor: cardBackground }]}>
          <View style={styles.totalRow}>
            <ThemedText style={styles.totalLabel}>Total Debits:</ThemedText>
            <ThemedText style={styles.totalAmount}>{getTotalDebits().toFixed(2)}</ThemedText>
          </View>
          <View style={styles.totalRow}>
            <ThemedText style={styles.totalLabel}>Total Credits:</ThemedText>
            <ThemedText style={styles.totalAmount}>{getTotalCredits().toFixed(2)}</ThemedText>
          </View>
          <View style={[styles.balanceRow, { backgroundColor: isBalanced ? '#10B981' : '#EF4444' }]}>
            <ThemedText style={styles.balanceText}>
              {isBalanced ? '✓ Balanced' : '✗ Not Balanced'}
            </ThemedText>
          </View>
        </View>

        <TouchableOpacity 
          style={[
            styles.button, 
            (!isBalanced || isCreating) && styles.buttonDisabled
          ]}
          onPress={handleCreateJournal}
          disabled={!isBalanced || isCreating}
        >
          <ThemedText style={styles.buttonText}>
            {isCreating ? 'Creating...' : 'Create Journal'}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>

      {/* Account Picker Modal */}
      <Modal
        visible={showAccountPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAccountPicker}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Select Account</ThemedText>
            <TouchableOpacity onPress={closeAccountPicker} style={styles.closeButton}>
              <ThemedText style={styles.closeButtonText}>✕</ThemedText>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: {item: Account}) => (
              <TouchableOpacity
                style={[
                  styles.accountItem,
                  { 
                    borderColor,
                    backgroundColor: inputBackground,
                  }
                ]}
                onPress={() => handleAccountSelect(item)}
              >
                <View style={styles.accountItemContent}>
                  <ThemedText style={styles.accountItemName}>{item.name}</ThemedText>
                  <View style={styles.accountItemDetails}>
                    <ThemedText style={styles.accountItemType}>{item.accountType}</ThemedText>
                    <ThemedText style={styles.accountItemCurrency}>{item.currencyCode}</ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            style={styles.accountsList}
          />
        </SafeAreaView>
      </Modal>
    </ThemedView>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  listButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 16,
  },
  listButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 16,
  },
  lineContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  lineNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#EF4444',
    borderRadius: 4,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  lineInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  accountSelector: {
    flex: 2,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
  },
  accountText: {
    fontSize: 14,
  },
  placeholderText: {
    fontSize: 14,
    opacity: 0.6,
  },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    textAlign: 'right',
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  debitButton: {
    backgroundColor: '#3B82F6',
  },
  creditButton: {
    backgroundColor: '#10B981',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  debitText: {
    color: '#fff',
  },
  creditText: {
    color: '#fff',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  addLineButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  addLineButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  totalsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  balanceText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  accountsList: {
    flex: 1,
  },
  accountItem: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  accountItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountItemName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  accountItemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountItemType: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.7,
  },
  accountItemCurrency: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.7,
  },
})
