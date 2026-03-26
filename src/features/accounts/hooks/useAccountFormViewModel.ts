import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import Account, {
    AccountSubtype,
    AccountType,
    getAccountSubtypesForType,
    getDefaultSubtypeForType,
} from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { IconName } from '@/src/components/core';
import Currency from '@/src/data/models/Currency';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import { useAccount, useAccountBalance, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { of } from 'rxjs';

export interface AccountFormViewModel {
    heroTitle: string;
    heroSubtitle: string;
    isEditMode: boolean;
    accountName: string;
    setAccountName: (value: string) => void;
    accountType: AccountType;
    setAccountType: (value: AccountType) => void;
    accountSubtype: AccountSubtype;
    setAccountSubtype: (value: AccountSubtype) => void;
    availableSubtypes: readonly AccountSubtype[];
    selectedCurrency: string;
    currencies: Currency[];
    setSelectedCurrency: (value: string) => void;
    selectedIcon: IconName;
    setSelectedIcon: (value: IconName) => void;
    isIconPickerVisible: boolean;
    setIsIconPickerVisible: (value: boolean) => void;
    initialBalance: string;
    onInitialBalanceChange: (value: string) => void;
    onBack: () => void;
    isCreating: boolean;
    formError: string | null;
    onSave: () => void;
    saveLabel: string;
    currencyLabel: string;
    showInitialBalance: boolean;
    isSaveDisabled: boolean;
    parentAccountId: string;
    parentAccountName: string;
    setParentAccountId: (value: string) => void;
    potentialParents: Account[];
    isParentPickerVisible: boolean;
    setIsParentPickerVisible: (visible: boolean) => void;
    isParent: boolean;
    showCurrency: boolean;
    // Metadata fields
    statementDay: string;
    setStatementDay: (value: string) => void;
    dueDay: string;
    setDueDay: (value: string) => void;
    creditLimitAmount: string;
    setCreditLimitAmount: (value: string) => void;
    apr: string;
    setApr: (value: string) => void;
    emiDay: string;
    setEmiDay: (value: string) => void;
    loanTenureMonths: string;
    setLoanTenureMonths: (value: string) => void;
    minimumPaymentAmount: string;
    setMinimumPaymentAmount: (value: string) => void;
    notes: string;
    setNotes: (value: string) => void;
    isLoading: boolean;
}

export function useAccountFormViewModel(): AccountFormViewModel {
    const params = useLocalSearchParams();
    const { defaultCurrency } = useUI();

    const accountId = params.accountId as string | undefined;
    const typeParam = params.type as string | undefined;
    const isEditMode = Boolean(accountId);

    const { account: existingAccount, version: accountVersion, isLoading: isAccountLoading } = useAccount(accountId || null);
    const { balanceData, isLoading: isBalanceLoading } = useAccountBalance(accountId || null);
    const { accounts } = useAccounts();

    const { data: isParent } = useObservable(
        () => accountId ? accountRepository.observeHasChildren(accountId) : of(false),
        [accountId],
        false
    );

    const { currencies } = useCurrencies();
    const { data: metadataRecords } = useObservable(
        () => existingAccount ? existingAccount.metadataRecords.observe() : of([]),
        [existingAccount],
        [] as AccountMetadata[]
    );
    const existingMetadata = metadataRecords[0];

    // Initial Data Injection: Extract preview data from params
    const pName = params.pName as string;
    const pType = params.pType as string;
    const pCurrency = params.pCurrency as string;
    const pIcon = params.pIcon as string;

    const getInitialAccountType = (): AccountType => {
        if (pType) {
            const upperType = pType.toUpperCase() as keyof typeof AccountType;
            if (Object.values(AccountType).includes(upperType as AccountType)) {
                return upperType as AccountType;
            }
        }
        if (typeParam) {
            const upperType = typeParam.toUpperCase() as keyof typeof AccountType;
            if (Object.values(AccountType).includes(upperType as AccountType)) {
                return upperType as AccountType;
            }
        }
        return AccountType.ASSET;
    };

    // Form State
    const [accountName, setAccountName] = useState(pName || '');
    const [accountType, setAccountType] = useState<AccountType>(getInitialAccountType());
    const [accountSubtype, setAccountSubtype] = useState<AccountSubtype>(
        getDefaultSubtypeForType(getInitialAccountType())
    );
    const [selectedCurrency, setSelectedCurrency] = useState<string>(pCurrency || defaultCurrency || AppConfig.defaultCurrency);
    const [selectedIcon, setSelectedIcon] = useState<IconName>((pIcon as IconName) || 'wallet');
    const [initialBalance, setInitialBalance] = useState('');
    const [parentAccountId, setParentAccountId] = useState('');
    const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);
    const [isParentPickerVisible, setIsParentPickerVisible] = useState(false);

    // Metadata State
    const [statementDay, setStatementDay] = useState('');
    const [dueDay, setDueDay] = useState('');
    const [creditLimitAmount, setCreditLimitAmount] = useState('');
    const [apr, setApr] = useState('');
    const [emiDay, setEmiDay] = useState('');
    const [loanTenureMonths, setLoanTenureMonths] = useState('');
    const [minimumPaymentAmount, setMinimumPaymentAmount] = useState('');
    const [notes, setNotes] = useState('');

    const [localFormError, setLocalFormError] = useState<string | null>(null);

    // Load existing account data
    useEffect(() => {
        if (existingAccount) {
            setAccountName(existingAccount.name);
            setAccountType(existingAccount.accountType);
            setAccountSubtype(existingAccount.accountSubtype || getDefaultSubtypeForType(existingAccount.accountType));
            setSelectedCurrency(existingAccount.currencyCode);
            setSelectedIcon(existingAccount.icon || 'wallet');
            setParentAccountId(existingAccount.parentAccountId || '');

            if (balanceData && initialBalance === '') {
                setInitialBalance(balanceData.balance.toString());
            }

            // Load metadata
            if (existingMetadata) {
                setStatementDay(existingMetadata.statementDay?.toString() || '');
                setDueDay(existingMetadata.dueDay?.toString() || '');
                setCreditLimitAmount(existingMetadata.creditLimitAmount?.toString() || '');
                // apr is managed as aprBps in the repo persistence input, but let's see what model has
                setApr(existingMetadata.aprBps?.toString() || '');
                setEmiDay(existingMetadata.emiDay?.toString() || '');
                setLoanTenureMonths(existingMetadata.loanTenureMonths?.toString() || '');
                setMinimumPaymentAmount(existingMetadata.minimumPaymentAmount?.toString() || '');
                setNotes(existingMetadata.notes || '');
            }
        }
    }, [existingAccount, accountVersion, existingMetadata, balanceData, initialBalance]);

    const validation = useAccountValidation(
        accountName,
        accounts,
        accountId
    );

    const persistence = useAccountPersistence(
        existingAccount,
        accountId,
        accounts.length > 0
    );

    const onAccountTypeChange = (value: AccountType) => {
        setAccountType(value);
        // Reset subtype to default for new type
        setAccountSubtype(getDefaultSubtypeForType(value));
    };

    const onAccountSubtypeChange = (value: AccountSubtype) => {
        setAccountSubtype(value);
    };

    const onInitialBalanceChange = (value: string) => {
        setInitialBalance(value);
    };

    const onSave = async () => {
        logger.info(`Saving account: ${accountName} (ID: ${accountId || 'new'})`);

        if (initialBalance && isNaN(Number(initialBalance))) {
            setLocalFormError('Initial balance must be a number');
            return;
        }

        if (accountType === 'LIABILITY') {
            const dayFields: Record<string, string> = {
                'Statement Day': statementDay,
                'Due Day': dueDay,
                'EMI Day': emiDay,
            };

            for (const [name, value] of Object.entries(dayFields)) {
                if (value) {
                    const day = parseInt(value, 10);
                    const minDay = AppConfig.constants.validation.minDayOfMonth;
                    const maxDay = AppConfig.constants.validation.maxDayOfMonth;
                    if (isNaN(day) || day < minDay || day > maxDay) {
                        setLocalFormError(`${name} must be between ${minDay} and ${maxDay}`);
                        return;
                    }
                }
            }

            if (apr) {
                const aprVal = parseFloat(apr);
                const minApr = AppConfig.constants.validation.minAprPercent;
                const maxApr = AppConfig.constants.validation.maxAprPercent;
                if (isNaN(aprVal) || aprVal < minApr || aprVal > maxApr) {
                    setLocalFormError(`APR must be between ${minApr} and ${maxApr}`);
                    return;
                }
            }
        }

        const metadata: any = {};
        if (statementDay) metadata.statementDay = parseInt(statementDay, 10);
        if (dueDay) metadata.dueDay = parseInt(dueDay, 10);
        if (creditLimitAmount) metadata.creditLimitAmount = parseFloat(creditLimitAmount);
        if (apr) metadata.aprBps = Math.round(parseFloat(apr) * 100);
        if (emiDay) metadata.emiDay = parseInt(emiDay, 10);
        if (loanTenureMonths) metadata.loanTenureMonths = parseInt(loanTenureMonths, 10);
        if (minimumPaymentAmount) metadata.minimumPaymentAmount = parseFloat(minimumPaymentAmount);
        if (notes) metadata.notes = notes;
        try {
            await persistence.handleSave(
                accountName,
                accountType,
                accountSubtype,
                selectedCurrency,
                selectedIcon,
                initialBalance,
                balanceData || undefined, // currentBalanceData
                parentAccountId || undefined,
                Object.keys(metadata).length > 0 ? metadata : undefined
            );

            // Note: handleSave in persistence already calls router.back()
        } catch (error) {
            showErrorAlert(error instanceof ValidationError ? error : new ValidationError('Failed to save account'));
        }
    };

    const hasExistingAccounts = accounts.length > 0;
    const heroTitle = isEditMode
        ? 'Edit Account'
        : (hasExistingAccounts ? 'Create New Account' : 'Create Your First Account');
    const heroSubtitle = isEditMode
        ? 'Update your account details'
        : (hasExistingAccounts ? 'Add another source of funds' : 'Start tracking your finances');

    const saveLabel = isEditMode ? 'Save Changes' : 'Create Account';

    const currencyLabel = useMemo(() => {
        return `Currency${isEditMode ? ' (cannot be changed)' : ''}`;
    }, [isEditMode]);

    const potentialParents = useMemo(() => {
        return accounts.filter(a =>
            a.id !== accountId &&
            a.accountType === accountType &&
            a.currencyCode === selectedCurrency &&
            !a.parentAccountId
        );
    }, [accounts, accountId, accountType, selectedCurrency]);

    const parentAccountName = useMemo(() => {
        if (!parentAccountId) return 'None';
        const parent = potentialParents.find(a => a.id === parentAccountId);
        return parent ? parent.name : 'None';
    }, [parentAccountId, potentialParents]);

    const effectiveIsParent = isParent;
    const showCurrency = true;
    const showBalance = !effectiveIsParent;

    const availableSubtypes = useMemo(() => {
        return getAccountSubtypesForType(accountType);
    }, [accountType]);

    return {
        heroTitle,
        heroSubtitle,
        isEditMode,
        accountName,
        setAccountName,
        accountType,
        setAccountType: onAccountTypeChange,
        accountSubtype,
        setAccountSubtype: onAccountSubtypeChange,
        availableSubtypes,
        selectedCurrency,
        currencies,
        setSelectedCurrency,
        selectedIcon,
        setSelectedIcon,
        isIconPickerVisible,
        setIsIconPickerVisible,
        initialBalance,
        onInitialBalanceChange,
        onBack: () => AppNavigation.back(),
        isCreating: persistence.isCreating,
        formError: validation.formError || localFormError,
        onSave,
        saveLabel,
        currencyLabel,
        showInitialBalance: showBalance,
        isSaveDisabled: !accountName.trim() || persistence.isCreating || !!validation.formError || !!localFormError,
        parentAccountId,
        parentAccountName,
        setParentAccountId,
        potentialParents,
        isParentPickerVisible,
        setIsParentPickerVisible,
        isParent: effectiveIsParent,
        showCurrency,
        statementDay,
        setStatementDay,
        dueDay,
        setDueDay,
        creditLimitAmount,
        setCreditLimitAmount,
        apr,
        setApr,
        emiDay,
        setEmiDay,
        loanTenureMonths,
        setLoanTenureMonths,
        minimumPaymentAmount,
        setMinimumPaymentAmount,
        notes,
        setNotes,
        isLoading: isAccountLoading || isBalanceLoading
    };
}
