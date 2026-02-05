import { AppButton, AppCard, AppInput, AppText, IconName, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Shape, Spacing, Typography } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { AccountType } from '@/src/data/models/Account';
import { AccountTypeSelector } from '@/src/features/accounts/components/AccountTypeSelector';
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector';
import { useAccount, useAccountActions, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { IconPickerModal } from '@/src/features/onboarding/components/IconPickerModal';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { sanitizeInput, validateAccountName } from '@/src/utils/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function AccountCreationScreen() {
    const router = useRouter()
    const params = useLocalSearchParams()
    const { theme } = useTheme()
    const { defaultCurrency } = useUI()

    // Edit mode state
    const accountId = params.accountId as string | undefined
    const typeParam = params.type as string | undefined
    const isEditMode = Boolean(accountId)
    const { account: existingAccount } = useAccount(accountId || null)
    const { createAccount, updateAccount } = useAccountActions()
    const { accounts } = useAccounts()
    useCurrencies() // Keep hook if it triggers fetch, otherwise remove entirely?
    // Actually useCurrencies likely returns { currencies, loading, error }etc. 
    // If I just call useCurrencies(), it might complain. 
    // Let's see if useCurrencies has side effects. Usually hooks that fetch data on mount do.
    // If I remove the hook call entirely, data might not load if this is the first screen.
    // But `useCurrencies` implies it provides data.
    // Let's just remove the variable capture.

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
    const [selectedIcon, setSelectedIcon] = useState<string>('wallet')
    const [isIconPickerVisible, setIsIconPickerVisible] = useState(false)
    const [initialBalance, setInitialBalance] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [hasExistingAccounts, setHasExistingAccounts] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    // Sync state when account data loads
    React.useEffect(() => {
        if (existingAccount) {
            setAccountName(existingAccount.name)
            setAccountType(existingAccount.accountType)
            setSelectedCurrency(existingAccount.currencyCode)
            if (existingAccount.icon) {
                setSelectedIcon(existingAccount.icon)
            }
        }
    }, [existingAccount])

    // Update hasExistingAccounts based on accounts list from hook
    React.useEffect(() => {
        setHasExistingAccounts(accounts.length > 0)
    }, [accounts])

    // Real-time validation for duplicate names
    React.useEffect(() => {
        if (!accountName.trim()) {
            setFormError(null)
            return
        }

        const sanitizedName = sanitizeInput(accountName)
        const existing = accounts.find(a => a.name.toLowerCase() === sanitizedName.toLowerCase())

        if (existing && existing.id !== accountId) {
            setFormError(`Account with name "${sanitizedName}" already exists`)
        } else {
            setFormError(null)
        }
    }, [accountName, accounts, accountId])

    const handleCancel = () => {
        if (router.canGoBack()) {
            router.back()
        } else {
            router.push('/accounts' as any)
        }
    }

    const isSubmitting = useRef(false)

    const handleSaveAccount = async () => {
        if (isSubmitting.current) return
        isSubmitting.current = true

        logger.info(`[AccountCreation] handleSaveAccount for ${accountName}`)
        const nameValidation = validateAccountName(accountName)
        if (!nameValidation.isValid) {
            logger.warn(`[AccountCreation] Validation failed: ${nameValidation.error}`)
            showErrorAlert(new ValidationError(nameValidation.error!))
            isSubmitting.current = false
            return
        }

        const sanitizedName = sanitizeInput(accountName)

        // Check for duplicates (should be caught by real-time check, but double check)
        const existing = accounts.find(a => a.name.toLowerCase() === sanitizedName.toLowerCase());
        if (existing && existing.id !== accountId) {
            logger.warn(`[AccountCreation] Duplicate found: ${sanitizedName}`)
            setFormError(`Account with name "${sanitizedName}" already exists`)
            isSubmitting.current = false
            return
        }
        setFormError(null)

        setIsCreating(true)

        try {
            if (isEditMode && existingAccount) {
                await updateAccount(existingAccount, {
                    name: sanitizedName,
                    accountType: accountType,
                    icon: selectedIcon,
                })

                if (Platform.OS !== 'web') {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const { showSuccessAlert } = require('@/src/utils/alerts')
                    showSuccessAlert(
                        'Account Updated',
                        `"${sanitizedName}" has been updated successfully!`
                    )
                }
                logger.info('[AccountCreation] Account updated, calling back()')
                router.back()
            } else {
                logger.info(`[AccountCreation] Creating account ${sanitizedName}...`)
                await createAccount({
                    name: sanitizedName,
                    accountType: accountType,
                    currencyCode: selectedCurrency,
                    initialBalance: initialBalance ? parseFloat(initialBalance) : 0,
                    icon: selectedIcon,
                })

                // On web, window.alert blocks. We use logs for E2E and then navigate.
                // In a real app, we'd use a Toast or similar.
                if (Platform.OS !== 'web') {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const { showSuccessAlert } = require('@/src/utils/alerts')
                    showSuccessAlert(
                        'Account Created',
                        `"${sanitizedName}" has been created successfully!`
                    )
                }

                // Reset and navigate
                setAccountName('')
                setAccountType(AccountType.ASSET)
                setSelectedCurrency(defaultCurrency || AppConfig.defaultCurrency)
                setSelectedIcon('wallet')
                setInitialBalance('')

                if (hasExistingAccounts) {
                    if (router.canGoBack()) {
                        router.back()
                    } else {
                        router.replace('/(tabs)/accounts' as any)
                    }
                } else {
                    router.replace('/(tabs)/accounts' as any)
                }
            }
        } catch (error) {
            logger.error('Error saving account:', error)
            showErrorAlert(error, isEditMode ? 'Failed to Update Account' : 'Failed to Create Account')
        } finally {
            setIsCreating(false)
            isSubmitting.current = false
        }
    }



    return (
        <Screen
            title={isEditMode ? 'Edit Account' : 'New Account'}
            onBack={handleCancel}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    <AppText variant="heading" style={styles.title}>
                        {isEditMode ? 'Edit Account' : (hasExistingAccounts ? 'Create New Account' : 'Create Your First Account')}
                    </AppText>
                    <AppText variant="body" color="secondary" style={styles.subtitle}>
                        {isEditMode ? 'Update your account details' : (hasExistingAccounts ? 'Add another source of funds' : 'Start tracking your finances')}
                    </AppText>

                    {formError && (
                        <View style={[styles.errorContainer, { backgroundColor: theme.error + '20', borderColor: theme.error }]}>
                            <AppText variant="body" style={{ color: theme.error }}>{formError}</AppText>
                        </View>
                    )}

                    <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                        <View style={styles.nameRow}>
                            <TouchableOpacity
                                onPress={() => setIsIconPickerVisible(true)}
                                style={styles.iconButton}
                            >
                                <IvyIcon
                                    name={selectedIcon as IconName}
                                    color={theme.primary}
                                    size={40}
                                />
                            </TouchableOpacity>
                            <View style={{ flex: 1 }}>
                                <AppInput
                                    label="Account Name"
                                    value={accountName}
                                    onChangeText={setAccountName}
                                    placeholder="e.g., Checking Account"
                                    autoFocus
                                    maxLength={100}
                                    returnKeyType="next"
                                />
                            </View>
                        </View>
                    </AppCard>

                    {!isEditMode && (
                        <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                            <AppInput
                                label="Initial Balance"
                                value={initialBalance}
                                onChangeText={setInitialBalance}
                                placeholder="0.00"
                                keyboardType="decimal-pad"
                                returnKeyType="next"
                                testID="initial-balance-input"
                            />
                        </AppCard>
                    )}

                    <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                        <AppText variant="body" style={styles.label}>Account Type</AppText>
                        <AccountTypeSelector
                            value={accountType}
                            onChange={setAccountType}
                        />
                    </AppCard>

                    <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                        <AppText variant="body" style={styles.label}>Currency{isEditMode && ' (cannot be changed)'}</AppText>
                        <CurrencySelector
                            selectedCurrency={selectedCurrency}
                            onSelect={setSelectedCurrency}
                            disabled={isEditMode}
                        />
                    </AppCard>

                    <AppButton
                        variant="primary"
                        size="lg"
                        onPress={handleSaveAccount}
                        disabled={!accountName.trim() || isCreating || !!formError}
                        style={styles.createButton}
                        testID="save-button"
                    >
                        {isCreating ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Account')}
                    </AppButton>
                    <View style={{ height: Spacing.xxxl }} />
                </ScrollView>
            </KeyboardAvoidingView>

            <IconPickerModal
                visible={isIconPickerVisible}
                onClose={() => setIsIconPickerVisible(false)}
                onSelect={(icon) => {
                    setSelectedIcon(icon)
                    setIsIconPickerVisible(false)
                }}
                selectedIcon={selectedIcon as any}
            />
        </Screen>
    )
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        padding: Spacing.lg,
    },
    title: {
        fontSize: Typography.sizes.xxl,
        fontFamily: Typography.fonts.bold,
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
        fontFamily: Typography.fonts.semibold,
    },
    createButton: {
        marginTop: Spacing.xl,
    },
    errorContainer: {
        padding: Spacing.md,
        borderRadius: Shape.radius.sm,
        borderWidth: 1,
        marginBottom: Spacing.lg,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    iconButton: {
        marginTop: Spacing.md, // Align with input text roughly
    },
});
