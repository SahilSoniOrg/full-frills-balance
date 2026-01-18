import { AppButton, AppCard, AppText } from '@/components/core'
import { AppConfig, Shape, Spacing, ThemeMode, useThemeColors } from '@/constants'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import Currency from '@/src/data/models/Currency'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts'
import { ValidationError } from '@/src/utils/errors'
import { sanitizeInput, validateAccountName } from '@/src/utils/validation'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { FlatList, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useUser } from '../contexts/UIContext'

export default function AccountCreationScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()

  // Derive theme mode following the explicit pattern from design preview
  const themeMode: ThemeMode = themePreference === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode

  const theme = useThemeColors(themeMode)

  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>(AccountType.ASSET)
  const [selectedCurrency, setSelectedCurrency] = useState<string>(AppConfig.defaultCurrency)
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Load available currencies
  React.useEffect(() => {
    const loadCurrencies = async () => {
      try {
        const currencyCollection = database.collections.get<Currency>('currencies')
        const allCurrencies = await currencyCollection.query().fetch()
        setCurrencies(allCurrencies)
      } catch (error) {
        console.error('Failed to load currencies:', error)
      }
    }
    loadCurrencies()
  }, [])

  const handleCancel = () => {
    // Go back to previous screen
    if (router.canGoBack()) {
      router.back()
    } else {
      // If no previous screen, go to accounts
      router.push('/accounts' as any)
    }
  }

  const handleCreateAccount = async () => {
    // Validate and sanitize input
    const nameValidation = validateAccountName(accountName)
    if (!nameValidation.isValid) {
      showErrorAlert(new ValidationError(nameValidation.error!))
      return
    }

    const sanitizedName = sanitizeInput(accountName)
    setIsCreating(true)

    try {
      await accountRepository.create({
        name: sanitizedName,
        accountType: accountType,
        currencyCode: selectedCurrency,
        description: `Created via account creation`,
      })

      showSuccessAlert(
        'Account Created',
        `"${sanitizedName}" has been created successfully!`
      )

      // Reset form
      setAccountName('')
      setAccountType(AccountType.ASSET)
      setSelectedCurrency(AppConfig.defaultCurrency)

      // Navigate to accounts list
      router.push('/(tabs)/accounts' as any)
    } catch (error) {
      console.error('Error creating account:', error)
      showErrorAlert(error, 'Failed to Create Account')
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
        <AppText variant="heading" themeMode={themeMode}>
          New Account
        </AppText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <AppText variant="heading" themeMode={themeMode} style={styles.title}>
          Create Your First Account
        </AppText>
        <AppText variant="body" color="secondary" themeMode={themeMode} style={styles.subtitle}>
          Start tracking your finances
        </AppText>

        <AppCard elevation="sm" padding="lg" style={styles.inputContainer} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode} style={styles.label}>Account Name</AppText>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                color: theme.text,
                backgroundColor: theme.surface
              }
            ]}
            value={accountName}
            onChangeText={setAccountName}
            placeholder="e.g., Checking Account"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            maxLength={100}
            returnKeyType="next"
          />
        </AppCard>

        <AppCard elevation="sm" padding="lg" style={styles.inputContainer} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode} style={styles.label}>Account Type</AppText>
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
                      : theme.surface
                  }
                ]}
                onPress={() => setAccountType(type.key as AccountType)}
              >
                <AppText
                  variant="body"
                  themeMode={themeMode}
                  style={[
                    styles.accountTypeText,
                    accountType === type.key && styles.accountTypeTextSelected,
                    {
                      color: accountType === type.key
                        ? '#fff'
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
        <AppCard elevation="sm" padding="lg" style={styles.inputContainer} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode} style={styles.label}>Currency</AppText>
          <TouchableOpacity
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }
            ]}
            onPress={() => setShowCurrencyModal(true)}
          >
            <AppText variant="body" themeMode={themeMode}>
              {currencies.find(c => c.code === selectedCurrency)?.name || selectedCurrency}
            </AppText>
            <AppText variant="body" color="secondary" themeMode={themeMode}>
              {selectedCurrency} {currencies.find(c => c.code === selectedCurrency)?.symbol}
            </AppText>
          </TouchableOpacity>
        </AppCard>

        <AppButton
          variant="primary"
          size="lg"
          onPress={handleCreateAccount}
          disabled={!accountName.trim() || isCreating}
          themeMode={themeMode}
          style={styles.createButton}
        >
          {isCreating ? 'Creating...' : 'Create Account'}
        </AppButton>
      </ScrollView>

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
              <AppText variant="heading" themeMode={themeMode}>Select Currency</AppText>
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
                    <AppText variant="body" themeMode={themeMode}>{item.name}</AppText>
                    <AppText variant="caption" color="secondary" themeMode={themeMode}>
                      {item.code}
                    </AppText>
                  </View>
                  <AppText variant="subheading" themeMode={themeMode}>{item.symbol}</AppText>
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
    borderRadius: Shape.radius.sm,
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
    borderRadius: Shape.radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  accountTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  accountTypeButton: {
    borderWidth: 1,
    borderRadius: Shape.radius.md,
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
    borderTopLeftRadius: Shape.radius.lg,
    borderTopRightRadius: Shape.radius.lg,
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
