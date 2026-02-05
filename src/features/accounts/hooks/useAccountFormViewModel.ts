import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import { AccountType } from '@/src/data/models/Account';
import { useAccount, useAccountActions, useAccountBalance, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { sanitizeInput, validateAccountName } from '@/src/utils/validation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface AccountFormViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
    title: string;
    heroTitle: string;
    heroSubtitle: string;
    isEditMode: boolean;
    accountName: string;
    setAccountName: (value: string) => void;
    accountType: AccountType;
    setAccountType: (value: AccountType) => void;
    selectedCurrency: string;
    setSelectedCurrency: (value: string) => void;
    selectedIcon: string;
    setSelectedIcon: (value: string) => void;
    isIconPickerVisible: boolean;
    setIsIconPickerVisible: (value: boolean) => void;
    initialBalance: string;
    onInitialBalanceChange: (value: string) => void;
    isCreating: boolean;
    formError: string | null;
    onCancel: () => void;
    onSave: () => void;
    saveLabel: string;
    currencyLabel: string;
    showInitialBalance: boolean;
    isSaveDisabled: boolean;
}

export function useAccountFormViewModel(): AccountFormViewModel {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { theme } = useTheme();
    const { defaultCurrency } = useUI();

    const accountId = params.accountId as string | undefined;
    const typeParam = params.type as string | undefined;
    const isEditMode = Boolean(accountId);
    const { account: existingAccount } = useAccount(accountId || null);
    const { balanceData: currentBalanceData } = useAccountBalance(accountId || null);
    const { createAccount, updateAccount, adjustBalance } = useAccountActions();
    const { accounts } = useAccounts();

    useCurrencies();

    const getInitialAccountType = (): AccountType => {
        if (typeParam) {
            const upperType = typeParam.toUpperCase() as keyof typeof AccountType;
            if (Object.values(AccountType).includes(upperType as AccountType)) {
                return upperType as AccountType;
            }
        }
        return AccountType.ASSET;
    };

    const [accountName, setAccountName] = useState('');
    const [accountType, setAccountType] = useState<AccountType>(getInitialAccountType());
    const [selectedCurrency, setSelectedCurrency] = useState<string>(defaultCurrency || AppConfig.defaultCurrency);
    const [selectedIcon, setSelectedIcon] = useState<string>('wallet');
    const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);
    const [initialBalance, setInitialBalance] = useState('');
    const balanceDirtyRef = useRef(false);
    const [isCreating, setIsCreating] = useState(false);
    const [hasExistingAccounts, setHasExistingAccounts] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        balanceDirtyRef.current = false;
    }, [accountId]);

    useEffect(() => {
        if (existingAccount) {
            setAccountName(existingAccount.name);
            setAccountType(existingAccount.accountType);
            setSelectedCurrency(existingAccount.currencyCode);
            if (existingAccount.icon) {
                setSelectedIcon(existingAccount.icon);
            }
            if (isEditMode && currentBalanceData && !balanceDirtyRef.current) {
                setInitialBalance(currentBalanceData.balance.toString());
            }
        }
    }, [existingAccount, isEditMode, currentBalanceData]);

    useEffect(() => {
        setHasExistingAccounts(accounts.length > 0);
    }, [accounts]);

    useEffect(() => {
        if (!accountName.trim()) {
            setFormError(null);
            return;
        }

        const sanitizedName = sanitizeInput(accountName);
        const existing = accounts.find(a => a.name.toLowerCase() === sanitizedName.toLowerCase());

        if (existing && existing.id !== accountId) {
            setFormError(`Account with name "${sanitizedName}" already exists`);
        } else {
            setFormError(null);
        }
    }, [accountName, accounts, accountId]);

    const onCancel = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.push('/accounts');
        }
    };

    const isSubmitting = useRef(false);

    const onInitialBalanceChange = (value: string) => {
        balanceDirtyRef.current = true;
        setInitialBalance(value);
    };

    const onSave = async () => {
        if (isSubmitting.current) return;
        isSubmitting.current = true;

        logger.info(`[AccountCreation] handleSaveAccount for ${accountName}`);
        const nameValidation = validateAccountName(accountName);
        if (!nameValidation.isValid) {
            logger.warn(`[AccountCreation] Validation failed: ${nameValidation.error}`);
            showErrorAlert(new ValidationError(nameValidation.error!));
            isSubmitting.current = false;
            return;
        }

        const sanitizedName = sanitizeInput(accountName);
        const existing = accounts.find(a => a.name.toLowerCase() === sanitizedName.toLowerCase());
        if (existing && existing.id !== accountId) {
            logger.warn(`[AccountCreation] Duplicate found: ${sanitizedName}`);
            setFormError(`Account with name "${sanitizedName}" already exists`);
            isSubmitting.current = false;
            return;
        }
        setFormError(null);

        setIsCreating(true);

        try {
            if (isEditMode && existingAccount) {
                const updatedAccount = await updateAccount(existingAccount, {
                    name: sanitizedName,
                    accountType: accountType,
                    icon: selectedIcon,
                });

                // Check for balance adjustment
                if (currentBalanceData && initialBalance) {
                    const targetBalance = parseFloat(initialBalance);
                    if (!isNaN(targetBalance) && Math.abs(targetBalance - currentBalanceData.balance) > 0.001) {
                        logger.info(`[AccountCreation] Triggering balance adjustment for ${sanitizedName}`);
                        await adjustBalance(updatedAccount, targetBalance);
                    }
                }

                if (Platform.OS !== 'web') {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const { showSuccessAlert } = require('@/src/utils/alerts');
                    showSuccessAlert(
                        'Account Updated',
                        `"${sanitizedName}" has been updated successfully!`
                    );
                }
                logger.info('[AccountCreation] Account updated, calling back()');
                router.back();
            } else {
                logger.info(`[AccountCreation] Creating account ${sanitizedName}...`);
                await createAccount({
                    name: sanitizedName,
                    accountType: accountType,
                    currencyCode: selectedCurrency,
                    initialBalance: initialBalance ? parseFloat(initialBalance) : 0,
                    icon: selectedIcon,
                });

                if (Platform.OS !== 'web') {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const { showSuccessAlert } = require('@/src/utils/alerts');
                    showSuccessAlert(
                        'Account Created',
                        `"${sanitizedName}" has been created successfully!`
                    );
                }

                setAccountName('');
                setAccountType(AccountType.ASSET);
                setSelectedCurrency(defaultCurrency || AppConfig.defaultCurrency);
                setSelectedIcon('wallet');
                setInitialBalance('');

                if (hasExistingAccounts) {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        router.replace('/(tabs)/accounts');
                    }
                } else {
                    router.replace('/(tabs)/accounts');
                }
            }
        } catch (error) {
            logger.error('Error saving account:', error);
            showErrorAlert(error, isEditMode ? 'Failed to Update Account' : 'Failed to Create Account');
        } finally {
            setIsCreating(false);
            isSubmitting.current = false;
        }
    };

    const title = isEditMode ? 'Edit Account' : 'New Account';
    const heroTitle = isEditMode
        ? 'Edit Account'
        : (hasExistingAccounts ? 'Create New Account' : 'Create Your First Account');
    const heroSubtitle = isEditMode
        ? 'Update your account details'
        : (hasExistingAccounts ? 'Add another source of funds' : 'Start tracking your finances');

    const saveLabel = isCreating
        ? (isEditMode ? 'Saving...' : 'Creating...')
        : (isEditMode ? 'Save Changes' : 'Create Account');

    const currencyLabel = useMemo(() => {
        return `Currency${isEditMode ? ' (cannot be changed)' : ''}`;
    }, [isEditMode]);

    return {
        theme,
        title,
        heroTitle,
        heroSubtitle,
        isEditMode,
        accountName,
        setAccountName,
        accountType,
        setAccountType,
        selectedCurrency,
        setSelectedCurrency,
        selectedIcon,
        setSelectedIcon,
        isIconPickerVisible,
        setIsIconPickerVisible,
        initialBalance,
        onInitialBalanceChange,
        isCreating,
        formError,
        onCancel,
        onSave,
        saveLabel,
        currencyLabel,
        showInitialBalance: true,
        isSaveDisabled: !accountName.trim() || isCreating || !!formError,
    };
}
