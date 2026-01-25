import { AppConfig, Opacity, Shape, Spacing, Typography } from '@/constants';
import { AppButton, AppCard, AppInput, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { useUI } from '@/src/contexts/UIContext'; // Fixed relative import to absolute
import { database } from '@/src/data/database/Database';
import Account, { AccountType } from '@/src/data/models/Account';
import Currency from '@/src/data/models/Currency';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { useTheme } from '@/src/hooks/use-theme';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { sanitizeInput, validateAccountName } from '@/src/utils/validation';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

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
    const [formError, setFormError] = useState<string | null>(null)

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
                }
            } catch (error) {
                console.error('Failed to load account:', error)
                showErrorAlert(error, 'Failed to load account')
            }
        }
        loadAccountData()
    }, [accountId])

    const handleCancel = () => {
        if (router.canGoBack()) {
            router.back()
        } else {
            router.push('/accounts' as any)
        }
    }

    const handleSaveAccount = async () => {
        const nameValidation = validateAccountName(accountName)
        if (!nameValidation.isValid) {
            showErrorAlert(new ValidationError(nameValidation.error!))
            return
        }

        const sanitizedName = sanitizeInput(accountName)

        // Check for duplicates
        const existing = await accountRepository.findByName(sanitizedName)
        if (existing && existing.id !== accountId) {
            setFormError(`Account with name "${sanitizedName}" already exists`)
            return
        }
        setFormError(null)

        setIsCreating(true)

        try {
            if (isEditMode && existingAccount) {
                await accountRepository.update(existingAccount, {
                    name: sanitizedName,
                })

                if (Platform.OS !== 'web') {
                    const { showSuccessAlert } = require('@/src/utils/alerts')
                    showSuccessAlert(
                        'Account Updated',
                        `"${sanitizedName}" has been updated successfully!`
                    )
                }
                router.back()
            } else {
                await accountRepository.create({
                    name: sanitizedName,
                    accountType: accountType,
                    currencyCode: selectedCurrency,
                    initialBalance: initialBalance ? parseFloat(initialBalance) : 0,
                })

                // On web, window.alert blocks. We use console log for E2E and then navigate.
                // In a real app, we'd use a Toast or similar.
                if (Platform.OS !== 'web') {
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
                setInitialBalance('')

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
                                            opacity: isEditMode ? Opacity.medium : Opacity.solid
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
                                    opacity: isEditMode ? Opacity.medium : Opacity.solid
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
                    <View style={{ height: Spacing.xxxl }} />
                </ScrollView>
            </KeyboardAvoidingView>

            <Modal
                visible={showCurrencyModal}
                animationType="slide"
                transparent
                onRequestClose={() => setShowCurrencyModal(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <AppText variant="heading">Select Currency</AppText>
                            <TouchableOpacity onPress={() => setShowCurrencyModal(false)}>
                                <Ionicons name="close" size={Typography.sizes.xxl} color={theme.text} />
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
    input: {
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: Typography.sizes.base,
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
        minWidth: 96,
    },
    accountTypeButtonSelected: {
        borderWidth: 2,
    },
    accountTypeText: {
        textAlign: 'center',
        fontFamily: Typography.fonts.medium,
    },
    accountTypeTextSelected: {
        fontFamily: Typography.fonts.bold,
    },
    createButton: {
        marginTop: Spacing.xl,
    },
    modalOverlay: {
        flex: 1,
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
    errorContainer: {
        padding: Spacing.md,
        borderRadius: Shape.radius.sm,
        borderWidth: 1,
        marginBottom: Spacing.lg,
    },
});
