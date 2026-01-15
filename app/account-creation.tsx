import { ThemedText } from '@/components/legacy/themed-text'
import { ThemedView } from '@/components/legacy/themed-view'
import { AppConfig } from '@/constants'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { AccountType } from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts'
import { ValidationError } from '@/src/utils/errors'
import { sanitizeInput, validateAccountName } from '@/src/utils/validation'
import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native'
import { useUser } from '../contexts/UIContext'

export default function AccountCreationScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const colorScheme = useColorScheme()
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
      
      // Navigate to accounts after a short delay
      setTimeout(() => {
        router.push('/accounts' as any)
      }, 1000)
      
    } catch (error) {
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
    <ThemedView style={styles.container}>
      <ScrollView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Create Your First Account
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Start tracking your finances
        </ThemedText>
        
        <View style={styles.inputContainer}>
          <ThemedText style={styles.label}>Account Name</ThemedText>
          <TextInput
            style={[
              styles.input,
              { 
                borderColor: colorScheme === 'dark' ? '#444' : '#ddd',
                color: colorScheme === 'dark' ? '#fff' : '#000',
                backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff'
              }
            ]}
            value={accountName}
            onChangeText={setAccountName}
            placeholder="e.g., Checking Account"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            autoFocus
            maxLength={100}
            returnKeyType="next"
          />
        </View>

        <View style={styles.inputContainer}>
          <ThemedText style={styles.label}>Account Type</ThemedText>
          <View style={styles.accountTypeContainer}>
            {accountTypes.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.accountTypeButton,
                  accountType === type.key && styles.accountTypeButtonSelected,
                  { 
                    borderColor: colorScheme === 'dark' ? '#444' : '#ddd',
                    backgroundColor: accountType === type.key 
                      ? '#007AFF' 
                      : colorScheme === 'dark' ? '#2a2a2a' : '#fff'
                  }
                ]}
                onPress={() => setAccountType(type.key as AccountType)}
              >
                <ThemedText style={[
                  styles.accountTypeText,
                  accountType === type.key && styles.accountTypeTextSelected
                ]}>
                  {type.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          style={[
            styles.button, 
            (!accountName.trim() || isCreating) && styles.buttonDisabled
          ]}
          onPress={handleCreateAccount}
          disabled={!accountName.trim() || isCreating}
        >
          <ThemedText style={styles.buttonText}>
            {isCreating ? 'Creating...' : 'Create Account'}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  accountTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  accountTypeButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  accountTypeButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  accountTypeText: {
    fontSize: 14,
    color: '#333',
  },
  accountTypeTextSelected: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
