import { AppButton, AppCard, AppText } from '@/components/core';
import { AppConfig, Shape, Spacing, ThemeMode, useThemeColors } from '@/constants';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { sanitizeAmount } from '@/src/utils/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SimpleJournalForm from '../components/journal/SimpleJournalForm';
import { useUser } from '../contexts/UIContext';

interface JournalEntryLine {
  id: string;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  accountCurrency?: string; // Currency of the selected account
  amount: string; // Amount in account's currency (what user enters)
  amountInJournalCurrency?: number; // Calculated amount in journal currency for balancing
  transactionType: TransactionType;
  notes: string;
  exchangeRate?: string; // Exchange rate (auto-fetched or manual)
}

export default function JournalEntryScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const { themePreference } = useUser()
  const colorScheme = useColorScheme()
  const themeMode: ThemeMode = themePreference === 'system'
    ? (colorScheme === 'dark' ? 'dark' : 'light')
    : themePreference
  const theme = useThemeColors(themeMode)

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

  // Guided mode state
  const [isGuidedMode, setIsGuidedMode] = useState(true)

  // Simple mode state (Handled in SimpleJournalForm)
  const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>('expense')

  // Advanced mode state (existing)
  const [description, setDescription] = useState('')
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0])
  const [lines, setLines] = useState<JournalEntryLine[]>([
    { id: '1', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.DEBIT, notes: '', exchangeRate: '' },
    { id: '2', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.CREDIT, notes: '', exchangeRate: '' },
  ])
  const [accounts, setAccounts] = useState<any[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)

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

  const addLine = () => {
    const newId = (Math.max(...lines.map(l => parseInt(l.id))) + 1).toString()
    setLines([...lines, {
      id: newId,
      accountId: '',
      accountName: '',
      accountType: AccountType.ASSET,
      amount: '',
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: ''
    }])
  }

  const removeLine = (id: string) => {
    if (lines.length > 2) {
      setLines(lines.filter(line => line.id !== id))
    }
  }

  const updateLine = (id: string, field: keyof JournalEntryLine, value: any) => {
    setLines(lines.map(line =>
      line.id === id ? { ...line, [field]: value } : line
    ))
  }

  const selectAccount = (accountId: string) => {
    if (!selectedLineId) return

    const account = accounts.find(acc => acc.id === accountId)
    if (account) {
      // Update all fields at once to avoid state conflicts
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

  const getLineBaseAmount = (line: JournalEntryLine): number => {
    const amount = sanitizeAmount(line.amount) || 0;
    const rate = line.exchangeRate && parseFloat(line.exchangeRate) ? parseFloat(line.exchangeRate) : 1;

    // If account currency matches journal currency or no rate provided, use amount as is
    if (!line.accountCurrency || line.accountCurrency === AppConfig.defaultCurrency) {
      return amount;
    }

    // Convert to base currency (USD) for balancing
    // Formula: account_amount / exchange_rate = base_amount
    // (e.g., 90.50 EUR / 1.1050 rate = 81.90 USD)
    return amount / rate;
  }

  const getTotalDebits = () => {
    return lines
      .filter(line => line.transactionType === TransactionType.DEBIT)
      .reduce((sum, line) => sum + getLineBaseAmount(line), 0)
  }

  const getTotalCredits = () => {
    return lines
      .filter(line => line.transactionType === TransactionType.CREDIT)
      .reduce((sum, line) => sum + getLineBaseAmount(line), 0)
  }

  const isBalanced = Math.abs(getTotalDebits() - getTotalCredits()) < 0.01

  const validateJournal = () => {
    if (!description.trim()) {
      return { valid: false, error: 'Description is required' }
    }

    if (lines.some(line => !line.accountId)) {
      return { valid: false, error: 'All lines must have an account selected' }
    }

    if (lines.some(line => !line.amount || sanitizeAmount(line.amount) === 0)) {
      return { valid: false, error: 'All lines must have a valid amount' }
    }

    if (!isBalanced) {
      return { valid: false, error: 'Journal must be balanced (debits must equal credits)' }
    }

    return { valid: true, error: null }
  }


  const createJournal = async () => {
    const validation = validateJournal()
    if (!validation.valid) {
      Alert.alert('Validation Error', validation.error || 'Validation failed')
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
          amount: getLineBaseAmount(line),
          transactionType: line.transactionType,
          notes: line.notes.trim() || undefined,
          exchangeRate: line.exchangeRate && line.exchangeRate.trim()
            ? parseFloat(line.exchangeRate)
            : undefined,
        }))
      }

      await journalRepository.createJournalWithTransactions(journalData)
      showSuccessAlert('Success', 'Journal entry created successfully')
      router.push('/journal-list' as any)
    } catch (error) {
      console.error('Failed to create journal:', error)
      showErrorAlert('Failed to create journal entry')
    } finally {
      setIsCreating(false)
    }
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <AppText variant="body" themeMode={themeMode} style={styles.backButtonText}>←</AppText>
        </TouchableOpacity>
        <AppText variant="heading" themeMode={themeMode} style={styles.headerTitle}>
          {isGuidedMode ? 'Add Transaction' : 'Create Journal Entry'}
        </AppText>
        <TouchableOpacity onPress={() => router.push('/journal-list' as any)} style={styles.listButton}>
          <AppText variant="body" themeMode={themeMode} style={styles.listButtonText}>List</AppText>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Mode Toggle */}
        <AppCard elevation="sm" padding="lg" style={styles.modeToggleCard} themeMode={themeMode}>
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                isGuidedMode && styles.modeButtonActive,
                { backgroundColor: isGuidedMode ? theme.primary : theme.surface }
              ]}
              onPress={() => setIsGuidedMode(true)}
            >
              <AppText
                variant="body"
                themeMode={themeMode}
                style={{ color: isGuidedMode ? '#fff' : theme.text }}
              >
                Simple
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                !isGuidedMode && styles.modeButtonActive,
                { backgroundColor: !isGuidedMode ? theme.primary : theme.surface }
              ]}
              onPress={() => setIsGuidedMode(false)}
            >
              <AppText
                variant="body"
                themeMode={themeMode}
                style={{ color: !isGuidedMode ? '#fff' : theme.text }}
              >
                Advanced
              </AppText>
            </TouchableOpacity>
          </View>
        </AppCard>

        {isGuidedMode ? (
          <SimpleJournalForm
            accounts={accounts}
            themeMode={themeMode}
            onSuccess={() => {
              router.push('/(tabs)')
            }}
            initialType={transactionType}
          />
        ) : (
          // Advanced Mode UI (existing)
          <View>
            <AppCard elevation="sm" padding="lg" style={styles.titleCard} themeMode={themeMode}>
              <AppText variant="title" themeMode={themeMode}>Create Journal Entry</AppText>
            </AppCard>

            <AppCard elevation="sm" padding="lg" style={styles.inputCard} themeMode={themeMode}>
              <AppText variant="body" themeMode={themeMode} style={styles.label}>Date</AppText>
              <TextInput
                style={[styles.input, {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text
                }]}
                value={journalDate}
                onChangeText={setJournalDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
              />

              <AppText variant="body" themeMode={themeMode} style={styles.label}>Description</AppText>
              <TextInput
                style={[styles.input, styles.textArea, {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text
                }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Enter description"
                placeholderTextColor={theme.textSecondary}
                multiline
              />
            </AppCard>

            <AppCard elevation="sm" padding="lg" style={styles.linesCard} themeMode={themeMode}>
              <View style={styles.linesHeader}>
                <AppText variant="heading" themeMode={themeMode}>Journal Lines</AppText>
                <TouchableOpacity onPress={addLine} style={styles.addButton}>
                  <AppText variant="body" color="primary" themeMode={themeMode}>+ Add Line</AppText>
                </TouchableOpacity>
              </View>

              {lines.map((line, index) => (
                <View key={line.id} style={[styles.lineContainer, {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: theme.border
                }]}>
                  <View style={styles.lineHeader}>
                    <AppText variant="subheading" themeMode={themeMode}>Line {index + 1}</AppText>
                    {lines.length > 2 && (
                      <TouchableOpacity onPress={() => removeLine(line.id)} style={styles.removeButton}>
                        <AppText variant="body" color="error" themeMode={themeMode}>Remove</AppText>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.accountSelector, {
                      backgroundColor: theme.surface,
                      borderColor: theme.border
                    }]}
                    onPress={() => {
                      setSelectedLineId(line.id)
                      setShowAccountPicker(true)
                    }}
                  >
                    <AppText variant="body" themeMode={themeMode}>
                      {line.accountName || 'Select Account'}
                    </AppText>
                    <AppText variant="body" color="secondary" themeMode={themeMode}>▼</AppText>
                  </TouchableOpacity>

                  <View style={styles.lineRow}>
                    <View style={styles.halfWidth}>
                      <AppText variant="body" themeMode={themeMode} style={styles.label}>Type</AppText>
                      <View style={styles.typeButtons}>
                        <TouchableOpacity
                          style={[
                            styles.typeButton,
                            line.transactionType === TransactionType.DEBIT && styles.typeButtonActive,
                            line.transactionType === TransactionType.DEBIT && { backgroundColor: theme.primary },
                            { borderColor: theme.border }
                          ]}
                          onPress={() => updateLine(line.id, 'transactionType', TransactionType.DEBIT)}
                        >
                          <AppText
                            variant="body"
                            themeMode={themeMode}
                            style={[
                              line.transactionType === TransactionType.DEBIT && { color: theme.background }
                            ]}
                          >
                            DEBIT
                          </AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.typeButton,
                            line.transactionType === TransactionType.CREDIT && styles.typeButtonActive,
                            line.transactionType === TransactionType.CREDIT && { backgroundColor: theme.primary },
                            { borderColor: theme.border }
                          ]}
                          onPress={() => updateLine(line.id, 'transactionType', TransactionType.CREDIT)}
                        >
                          <AppText
                            variant="body"
                            themeMode={themeMode}
                            style={[
                              line.transactionType === TransactionType.CREDIT && { color: theme.background }
                            ]}
                          >
                            CREDIT
                          </AppText>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.halfWidth}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="body" themeMode={themeMode} style={styles.label}>Amount</AppText>
                        {line.accountCurrency && (
                          <AppText variant="caption" color="primary" themeMode={themeMode}>
                            {line.accountCurrency}
                          </AppText>
                        )}
                      </View>
                      <TextInput
                        style={[styles.input, {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                          color: theme.text
                        }]}
                        value={line.amount}
                        onChangeText={(value) => updateLine(line.id, 'amount', value)}
                        placeholder="0.00"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="numeric"
                      />
                      {line.accountCurrency && line.accountCurrency !== AppConfig.defaultCurrency && (
                        <AppText variant="caption" color="secondary" themeMode={themeMode}>
                          ≈ ${(getLineBaseAmount(line)).toFixed(2)} USD
                        </AppText>
                      )}
                    </View>
                  </View>

                  <AppText variant="body" themeMode={themeMode} style={styles.label}>Notes</AppText>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text
                    }]}
                    value={line.notes}
                    onChangeText={(value) => updateLine(line.id, 'notes', value)}
                    placeholder="Optional notes"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <AppText variant="body" themeMode={themeMode} style={styles.label}>
                      Exchange Rate (Optional)
                    </AppText>
                    {line.accountCurrency && line.accountCurrency !== AppConfig.defaultCurrency && (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const rate = await exchangeRateService.getRate(
                              line.accountCurrency!,
                              AppConfig.defaultCurrency
                            )
                            updateLine(line.id, 'exchangeRate', rate.toString())
                          } catch (error) {
                            console.error('Failed to fetch rate:', error)
                          }
                        }}
                      >
                        <AppText variant="caption" color="primary" themeMode={themeMode}>Auto-fetch</AppText>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text
                    }]}
                    value={line.exchangeRate || ''}
                    onChangeText={(value) => updateLine(line.id, 'exchangeRate', value)}
                    placeholder="e.g., 1.1050"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                  />
                  <AppText variant="caption" color="secondary" themeMode={themeMode} style={{ marginTop: -8, marginBottom: 8 }}>
                    {line.accountCurrency === AppConfig.defaultCurrency
                      ? 'Not needed (same as base currency)'
                      : `Rate to convert ${line.accountCurrency} to ${AppConfig.defaultCurrency}`}
                  </AppText>
                </View>
              ))}
            </AppCard>

            <AppCard elevation="sm" padding="lg" style={styles.summaryCard} themeMode={themeMode}>
              <View style={styles.summaryRow}>
                <AppText variant="body" themeMode={themeMode}>Total Debits:</AppText>
                <AppText variant="body" themeMode={themeMode}>${getTotalDebits().toFixed(2)}</AppText>
              </View>
              <View style={styles.summaryRow}>
                <AppText variant="body" themeMode={themeMode}>Total Credits:</AppText>
                <AppText variant="body" themeMode={themeMode}>${getTotalCredits().toFixed(2)}</AppText>
              </View>
              <View style={styles.summaryRow}>
                <AppText variant="heading" themeMode={themeMode}>Balance:</AppText>
                <AppText
                  variant="heading"
                  color={isBalanced ? "success" : "error"}
                  themeMode={themeMode}
                >
                  ${Math.abs(getTotalDebits() - getTotalCredits()).toFixed(2)}
                </AppText>
              </View>
              <AppText variant="body" color={isBalanced ? "success" : "error"} themeMode={themeMode} style={styles.balanceText}>
                {isBalanced ? '✓ Journal is balanced in USD' : '✗ Journal must be balanced in USD'}
              </AppText>
            </AppCard>

            <View style={styles.actions}>
              <AppButton
                variant="primary"
                onPress={createJournal}
                disabled={!isBalanced || isCreating}
                themeMode={themeMode}
                style={styles.createButton}
              >
                {isCreating ? 'Creating...' : 'Create Journal'}
              </AppButton>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Account Picker Modal */}
      <Modal
        visible={showAccountPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
            <View style={styles.modalHeader}>
              <AppText variant="heading" themeMode={themeMode}>Select Account</AppText>
              <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
                <AppText variant="body" color="secondary" themeMode={themeMode}>✕</AppText>
              </TouchableOpacity>
            </View>

            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.accountItem, {
                    backgroundColor: theme.surface,
                    borderColor: theme.border
                  }]}
                  onPress={() => selectAccount(item.id)}
                >
                  <View>
                    <AppText variant="body" themeMode={themeMode}>{item.name}</AppText>
                    <AppText variant="caption" color="secondary" themeMode={themeMode}>
                      {item.accountType} • {item.currencyCode}
                    </AppText>
                  </View>
                </TouchableOpacity>
              )}
              style={styles.accountsList}
            />
          </View>
        </View>
      </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  backButton: {
    padding: Spacing.sm,
  },
  backButtonText: {
    fontSize: 20,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  listButton: {
    padding: Spacing.sm,
  },
  listButtonText: {
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  modeToggleCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: Shape.radius.md,
    padding: Spacing.xs,
  },
  modeButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.sm,
    alignItems: 'center',
  },
  modeButtonActive: {
    // Shadow for active state
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    fontWeight: '600',
  },
  transactionTypeContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  transactionTypeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  transactionTypeButtonSelected: {
    borderWidth: 2,
  },
  accountSelector: {
    gap: Spacing.sm,
  },
  accountOption: {
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
  },
  accountOptionSelected: {
    borderWidth: 2,
  },
  titleCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  inputCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  linesCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  summaryCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  label: {
    marginBottom: Spacing.xs,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: Shape.radius.md,
    padding: Spacing.md,
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  linesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addButton: {
    padding: Spacing.sm,
  },
  lineContainer: {
    borderWidth: 1,
    borderRadius: Shape.radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  removeButton: {
    padding: Spacing.sm,
  },
  accountItem: {
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Shape.radius.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  halfWidth: {
    flex: 1,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Shape.radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  typeButtonActive: {
    // Handled by inline styles for theme colors
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  balanceText: {
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  actions: {
    padding: Spacing.lg,
  },
  createButton: {
    marginBottom: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Shape.radius.xl,
    borderTopRightRadius: Shape.radius.xl,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  accountsList: {
    flex: 1,
  },
})
