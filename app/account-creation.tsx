import { AppButton, AppCard, AppText } from '@/components/core'
import { AppConfig, Shape, Spacing, ThemeMode, useThemeColors } from '@/constants'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { AccountType } from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts'
import { ValidationError } from '@/src/utils/errors'
import { sanitizeInput, validateAccountName } from '@/src/utils/validation'
import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native'
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
  const [isCreating, setIsCreating] = useState(false)

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
        currencyCode: AppConfig.defaultCurrency,
        description: `Created via onboarding`,
      })

      showSuccessAlert(
        'Account Created',
        `"${sanitizedName}" has been created successfully!`
      )
      
      // Reset form
      setAccountName('')
      setAccountType(AccountType.ASSET)
      
      // Navigate to accounts list
      router.push('/accounts' as any)
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});
