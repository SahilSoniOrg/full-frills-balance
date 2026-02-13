import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import { AccountType } from '@/src/data/models/Account';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import { useAccount, useAccountBalance, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

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
    const params = useLocalSearchParams();
    const { theme } = useTheme();
    const { defaultCurrency } = useUI();

    const accountId = params.accountId as string | undefined;
    const typeParam = params.type as string | undefined;
    const isEditMode = Boolean(accountId);

    const { account: existingAccount, version: accountVersion } = useAccount(accountId || null);
    const { balanceData: currentBalanceData } = useAccountBalance(accountId || null);
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

    // Form State
    const [accountName, setAccountName] = useState('');
    const [accountType, setAccountType] = useState<AccountType>(getInitialAccountType());
    const [selectedCurrency, setSelectedCurrency] = useState<string>(defaultCurrency || AppConfig.defaultCurrency);
    const [selectedIcon, setSelectedIcon] = useState<string>('wallet');
    const [initialBalance, setInitialBalance] = useState('');
    const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);
    const hasExistingAccounts = accounts.length > 0;

    const formDirtyRef = useRef({
        name: false,
        type: false,
        currency: false,
        icon: false,
        balance: false,
    });

    // Hooks
    const validation = useAccountValidation(accountName, accounts, accountId);
    const persistence = useAccountPersistence(existingAccount, accountId, hasExistingAccounts);

    // Sync Effects
    useEffect(() => {
        formDirtyRef.current = { name: false, type: false, currency: false, icon: false, balance: false };
    }, [accountId]);

    useEffect(() => {
        if (existingAccount) {
            if (!formDirtyRef.current.name) setAccountName(existingAccount.name);
            if (!formDirtyRef.current.type) setAccountType(existingAccount.accountType);
            if (!formDirtyRef.current.currency) setSelectedCurrency(existingAccount.currencyCode);
            if (!formDirtyRef.current.icon && existingAccount.icon) setSelectedIcon(existingAccount.icon);
            if (isEditMode && currentBalanceData && !formDirtyRef.current.balance) {
                setInitialBalance(currentBalanceData.balance.toString());
            }
        }
    }, [existingAccount, accountVersion, isEditMode, currentBalanceData]);

    const onInitialBalanceChange = (value: string) => {
        formDirtyRef.current.balance = true;
        setInitialBalance(value);
    };

    const onSave = async () => {
        logger.info(`[AccountCreation] handleSaveAccount for ${accountName}`);

        const nameValidation = validation.validateName(accountName);
        if (!nameValidation.isValid) {
            logger.warn(`[AccountCreation] Validation failed: ${nameValidation.error}`);
            showErrorAlert(new ValidationError(nameValidation.error!));
            return;
        }

        if (validation.checkForDuplicates(accountName)) {
            // Error is already set in validation hook state, but we ensure we don't proceed
            return;
        }

        const balanceDataPayload = currentBalanceData ? { balance: currentBalanceData.balance } : undefined;

        await persistence.handleSave(
            accountName,
            accountType,
            selectedCurrency,
            selectedIcon,
            initialBalance,
            balanceDataPayload
        );
    };

    // UI Derived State
    const title = isEditMode ? 'Edit Account' : 'New Account';
    const heroTitle = isEditMode
        ? 'Edit Account'
        : (hasExistingAccounts ? 'Create New Account' : 'Create Your First Account');
    const heroSubtitle = isEditMode
        ? 'Update your account details'
        : (hasExistingAccounts ? 'Add another source of funds' : 'Start tracking your finances');

    const saveLabel = persistence.isCreating
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
        isCreating: persistence.isCreating,
        formError: validation.formError,
        onCancel: persistence.handleCancel,
        onSave,
        saveLabel,
        currencyLabel,
        showInitialBalance: true,
        isSaveDisabled: !accountName.trim() || persistence.isCreating || !!validation.formError,
    };
}
