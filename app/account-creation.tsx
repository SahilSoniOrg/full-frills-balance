import { AppButton, AppCard, AppInput, AppText } from '@/components/core'
import { AppConfig, Shape, Spacing } from '@/constants'
import { useTheme } from '@/hooks/use-theme'
import { database } from '@/src/data/database/Database'
import Account, { AccountType } from '@/src/data/models/Account'
import Currency from '@/src/data/models/Currency'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts'
import { ValidationError } from '@/src/utils/errors'
import { sanitizeInput, validateAccountName } from '@/src/utils/validation'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useUI } from '../contexts/UIContext'

export default function AccountCreationScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const { theme } = useTheme()
  const { defaultCurrency } = useUI()

  // Edit mode state
  const accountId = params.accountId as string | undefined
  const typeParam = params.type as string | undefined
  const isEditMode = Boolean(accountId)
  const [existingAccount, setExistingAccount] = useState<Account | null>(null)

  // Parse initial account type from URL param for deep-linking
  const getInitialAccountType = (): AccountType => {
    if (typeParam) {
      const upperType = typeParam.toUpperCase() as keyof typeof AccountType
      if (Object.values(AccountType).includes(upperType as AccountType)) {
        return upperType as AccountType
      }
    }
    return AccountType.ASSET
  }

  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>(getInitialAccountType())
  const [selectedCurrency, setSelectedCurrency] = useState<string>(defaultCurrency || AppConfig.defaultCurrency)
  const [initialBalance, setInitialBalance] = useState('')
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [hasExistingAccounts, setHasExistingAccounts] = useState(false)

  // Load available currencies
  React.useEffect(() => {
    const loadCurrencies = async () => {
      try {
        const currencyCollection = database.collections.get<Currency>('currencies')
        const allCurrencies = await currencyCollection.query().fetch()
        setCurrencies(allCurrencies)

        // Check for existing accounts
        const exists = await accountRepository.exists()
        setHasExistingAccounts(exists)
      } catch (error) {
        console.error('Failed to load screen data:', error)
      }
    }
    loadCurrencies()
  }, [])

  // Load existing account data for edit mode
  React.useEffect(() => {
    if (!accountId) return

    const loadAccountData = async () => {
      try {
        const account = await accountRepository.find(accountId)
        if (account) {
          setExistingAccount(account)
          setAccountName(account.name)
          setAccountType(account.accountType)
          setSelectedCurrency(account.currencyCode)
          // Don't set initial balance for edits - that would require a journal adjustment
        }
      } catch (error) {
        console.error('Failed to load account:', error)
        showErrorAlert(error, 'Failed to load account')
      }
    }
    loadAccountData()
  }, [accountId])

  const handleCancel = () => {
    // Go back to previous screen
    if (router.canGoBack()) {
      router.back()
    } else {
      // If no previous screen, go to accounts
      router.push('/accounts' as any)
    }
  }

  const handleSaveAccount = async () => {
    // Validate and sanitize input
    const nameValidation = validateAccountName(accountName)
    if (!nameValidation.isValid) {
      showErrorAlert(new ValidationError(nameValidation.error!))
      return
    }

    const sanitizedName = sanitizeInput(accountName)
    setIsCreating(true)

    try {
      if (isEditMode && existingAccount) {
        // Update existing account (only name can be changed)
        await accountRepository.update(existingAccount, {
          name: sanitizedName,
        })

        showSuccessAlert(
          'Account Updated',
          `"${sanitizedName}" has been updated successfully!`
        )

        // Navigate back to account details
        router.back()
      } else {
        // Create new account
        await accountRepository.create({
          name: sanitizedName,
          accountType: accountType,
          currencyCode: selectedCurrency,
          initialBalance: initialBalance ? parseFloat(initialBalance) : 0,
        })

        showSuccessAlert(
          'Account Created',
          `"${sanitizedName}" has been created successfully!`
        )

        // Reset form
        setAccountName('')
        setAccountType(AccountType.ASSET)
        setSelectedCurrency(defaultCurrency || AppConfig.defaultCurrency)
        setInitialBalance('')

        // Navigate to accounts list
        router.push('/(tabs)/accounts' as any)
      }
    } catch (error) {
      console.error('Error saving account:', error)
      showErrorAlert(error, isEditMode ? 'Failed to Update Account' : 'Failed to Create Account')
    } finally {
      setIsCreating(false)
    }
  }

  const accountTypes = [
    { key: AccountType.ASSET, label: 'Asset' },
    { key: AccountType.LIABILITY, label: 'Liability' },
    { key: AccountType.EQUITY, label: 'Equity' },
    { key: AccountType.INCOME, label: 'Income' },
    { key: AccountType.EXPENSE, label: 'Expense' },
  ]

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header with back button */}
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          onPress={handleCancel}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.text}
          />
        </TouchableOpacity>
        <AppText variant="heading">
          {isEditMode ? 'Edit Account' : 'New Account'}
        </AppText>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content}>
          <AppText variant="heading" style={styles.title}>
            {isEditMode ? 'Edit Account' : (hasExistingAccounts ? 'Create New Account' : 'Create Your First Account')}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.subtitle}>
            {isEditMode ? 'Update your account details' : (hasExistingAccounts ? 'Add another source of funds' : 'Start tracking your finances')}
          </AppText>

          <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
            <AppInput
              label="Account Name"
              value={accountName}
              onChangeText={setAccountName}
              placeholder="e.g., Checking Account"
              autoFocus
              maxLength={100}
              returnKeyType="next"
            />
          </AppCard>

          {/* Initial Balance - only shown for new accounts */}
          {!isEditMode && (
            <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
              <AppInput
                label="Initial Balance"
                value={initialBalance}
                onChangeText={setInitialBalance}
                placeholder="0.00"
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </AppCard>
          )}

          <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
            <AppText variant="body" style={styles.label}>Account Type{isEditMode && ' (cannot be changed)'}</AppText>
            <View style={styles.accountTypeContainer}>
              {accountTypes.map((type) => (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.accountTypeButton,
                    accountType === type.key && styles.accountTypeButtonSelected,
                    {
                      borderColor: theme.border,
                      backgroundColor: accountType === type.key
                        ? theme.primary
                        : theme.surface,
                      opacity: isEditMode ? 0.6 : 1
                    }
                  ]}
                  onPress={() => !isEditMode && setAccountType(type.key as AccountType)}
                  disabled={isEditMode}
                >
                  <AppText
                    variant="body"
                    style={[
                      styles.accountTypeText,
                      accountType === type.key && styles.accountTypeTextSelected,
                      {
                        color: accountType === type.key
                          ? theme.pureInverse
                          : theme.text
                      }
                    ]}
                  >
                    {type.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          </AppCard>

          {/* Currency Selector */}
          <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
            <AppText variant="body" style={styles.label}>Currency{isEditMode && ' (cannot be changed)'}</AppText>
            <TouchableOpacity
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: isEditMode ? 0.6 : 1
                }
              ]}
              onPress={() => !isEditMode && setShowCurrencyModal(true)}
              disabled={isEditMode}
            >
              <AppText variant="body">
                {currencies.find(c => c.code === selectedCurrency)?.name || selectedCurrency}
              </AppText>
              <AppText variant="body" color="secondary">
                {selectedCurrency} {currencies.find(c => c.code === selectedCurrency)?.symbol}
              </AppText>
            </TouchableOpacity>
          </AppCard>

          <AppButton
            variant="primary"
            size="lg"
            onPress={handleSaveAccount}
            disabled={!accountName.trim() || isCreating}
            style={styles.createButton}
          >
            {isCreating ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Account')}
          </AppButton>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Currency Selection Modal */}
      <Modal
        visible={showCurrencyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <AppText variant="heading">Select Currency</AppText>
              <TouchableOpacity onPress={() => setShowCurrencyModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={currencies}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.currencyItem,
                    { borderBottomColor: theme.border },
                    selectedCurrency === item.code && { backgroundColor: theme.primaryLight }
                  ]}
                  onPress={() => {
                    setSelectedCurrency(item.code)
                    setShowCurrencyModal(false)
                  }}
                >
                  <View>
                    <AppText variant="body">{item.name}</AppText>
                    <AppText variant="caption" color="secondary">
                      {item.code}
                    </AppText>
                  </View>
                  <AppText variant="subheading">{item.symbol}</AppText>
                </TouchableOpacity>
              )}
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
    borderRadius: Shape.radius.full, // Circular back button
  },
  placeholder: {
    width: 32, // Same width as back button for centering
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    minHeight: 48,
  },
  accountTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  accountTypeButton: {
    borderWidth: 1,
    borderRadius: Shape.radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 80,
  },
  accountTypeButtonSelected: {
    borderWidth: 2,
  },
  accountTypeText: {
    textAlign: 'center',
    fontWeight: '500',
  },
  accountTypeTextSelected: {
    fontWeight: '600',
  },
  createButton: {
    marginTop: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '70%',
    borderTopLeftRadius: Shape.radius.r1,
    borderTopRightRadius: Shape.radius.r1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  currencyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
});
