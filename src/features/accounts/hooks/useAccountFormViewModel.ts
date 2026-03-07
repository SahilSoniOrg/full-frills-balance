import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import Account, {
    AccountSubtype,
    AccountType,
    getAccountSubtypesForType,
    getDefaultSubtypeForType,
} from '@/src/data/models/Account';
import Currency from '@/src/data/models/Currency';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import { useAccount, useAccountBalance, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { balanceService } from '@/src/services/BalanceService';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
    selectedIcon: string;
    setSelectedIcon: (value: string) => void;
    isIconPickerVisible: boolean;
    setIsIconPickerVisible: (value: boolean) => void;
    initialBalance: string;
    onInitialBalanceChange: (value: string) => void;
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
}

export function useAccountFormViewModel(): AccountFormViewModel {
    const params = useLocalSearchParams();
    const { defaultCurrency } = useUI();

    const accountId = params.accountId as string | undefined;
    const typeParam = params.type as string | undefined;
    const isEditMode = Boolean(accountId);

    const { account: existingAccount, version: accountVersion } = useAccount(accountId || null);
    const { balanceData: currentBalanceData } = useAccountBalance(accountId || null);
    const { accounts } = useAccounts();

    const { data: isParent } = useObservable(
        () => accountId ? accountRepository.observeHasChildren(accountId) : of(false),
        [accountId],
        false
    );

    const { currencies } = useCurrencies();

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
    const [accountSubtype, setAccountSubtype] = useState<AccountSubtype>(
        getDefaultSubtypeForType(getInitialAccountType())
    );
    const [selectedCurrency, setSelectedCurrency] = useState<string>(defaultCurrency || AppConfig.defaultCurrency);
    const [selectedIcon, setSelectedIcon] = useState<string>('wallet');
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

    const hasExistingAccounts = accounts.length > 0;

    const formDirtyRef = useRef({
        name: false,
        type: false,
        subtype: false,
        currency: false,
        icon: false,
        balance: false,
    });

    // Hooks
    const validation = useAccountValidation(accountName, accounts, accountId);
    const persistence = useAccountPersistence(existingAccount, accountId, hasExistingAccounts);

    // Sync Effects
    useEffect(() => {
        formDirtyRef.current = { name: false, type: false, subtype: false, currency: false, icon: false, balance: false };
        setLocalFormError(null); // Clear local form error on accountId change
    }, [accountId]);

    useEffect(() => {
        if (existingAccount) {
            if (!formDirtyRef.current.name) setAccountName(existingAccount.name);
            if (!formDirtyRef.current.type) setAccountType(existingAccount.accountType);
            if (!formDirtyRef.current.subtype) {
                setAccountSubtype(
                    existingAccount.accountSubtype || getDefaultSubtypeForType(existingAccount.accountType)
                );
            }
            if (!formDirtyRef.current.currency) setSelectedCurrency(existingAccount.currencyCode);
            if (!formDirtyRef.current.icon && existingAccount.icon) setSelectedIcon(existingAccount.icon);
            if (existingAccount.parentAccountId) setParentAccountId(existingAccount.parentAccountId);
            if (isEditMode && currentBalanceData && !formDirtyRef.current.balance) {
                setInitialBalance(currentBalanceData.balance.toString());
            }

            // Load Metadata
            accountRepository.findMetadata(existingAccount.id).then(metadata => {
                if (metadata) {
                    if (metadata.statementDay !== undefined) setStatementDay(metadata.statementDay.toString());
                    if (metadata.dueDay !== undefined) setDueDay(metadata.dueDay.toString());
                    if (metadata.creditLimitAmount !== undefined) setCreditLimitAmount(metadata.creditLimitAmount.toString());
                    if (metadata.aprBps !== undefined) setApr((metadata.aprBps / 100).toString());
                    if (metadata.emiDay !== undefined) setEmiDay(metadata.emiDay.toString());
                    if (metadata.loanTenureMonths !== undefined) setLoanTenureMonths(metadata.loanTenureMonths.toString());
                    if (metadata.minimumPaymentAmount !== undefined) setMinimumPaymentAmount(metadata.minimumPaymentAmount.toString());
                    if (metadata.notes !== undefined) setNotes(metadata.notes);
                }
            });
        }
    }, [existingAccount, accountVersion, isEditMode, currentBalanceData]);

    const availableSubtypes = useMemo(
        () => getAccountSubtypesForType(accountType),
        [accountType]
    );

    const onAccountTypeChange = (nextType: AccountType) => {
        formDirtyRef.current.type = true;
        setAccountType(nextType);
        setAccountSubtype(getDefaultSubtypeForType(nextType));
    };

    const onAccountSubtypeChange = (subtype: AccountSubtype) => {
        formDirtyRef.current.subtype = true;
        setAccountSubtype(subtype);
    };

    const onInitialBalanceChange = (value: string) => {
        formDirtyRef.current.balance = true;
        setInitialBalance(value);
    };

    const onSave = async () => {
        logger.info(`[AccountCreation] handleSaveAccount for ${accountName}`);

        const nameValidation = validation.validateName(accountName);
        if (!nameValidation.isValid) {
            logger.warn(`[AccountCreation] Validation failed: ${nameValidation.error}`);
            setLocalFormError(nameValidation.error!);
            return;
        }

        // Metadata Validation
        if (accountType === 'LIABILITY') {
            const dayFields: Record<string, string> = {
                'Statement Day': statementDay,
                'Due Day': dueDay,
                'EMI Day': emiDay,
            };

            for (const [name, value] of Object.entries(dayFields)) {
                if (value) {
                    const day = parseInt(value, 10);
                    if (isNaN(day) || day < 1 || day > 31) {
                        setLocalFormError(`${name} must be between 1 and 31`);
                        return;
                    }
                }
            }

            if (apr) {
                const aprVal = parseFloat(apr);
                if (isNaN(aprVal) || aprVal < 0 || aprVal > 100) {
                    setLocalFormError('APR must be between 0 and 100');
                    return;
                }
            }
        }

        setLocalFormError(null);

        if (validation.checkForDuplicates(accountName)) {
            // Error is already set in validation hook state, but we ensure we don't proceed
            return;
        }

        const balanceDataPayload = currentBalanceData ? { balance: currentBalanceData.balance } : undefined;

        const parent = parentAccountId ? accounts.find(a => a.id === parentAccountId) : null;
        if (parent) {
            const balance = await balanceService.getAccountBalance(parent.id);
            if (balance.transactionCount > 0) {
                showErrorAlert(new ValidationError(`Account "${parent.name}" has transactions and cannot be used as a parent. Move or delete transactions before using this account as a parent.`));
                return;
            }
        }

        const metadata = {
            statementDay: statementDay ? parseInt(statementDay, 10) : undefined,
            dueDay: dueDay ? parseInt(dueDay, 10) : undefined,
            creditLimitAmount: creditLimitAmount ? parseFloat(creditLimitAmount) : undefined,
            aprBps: apr ? Math.round(parseFloat(apr) * 100) : undefined,
            emiDay: emiDay ? parseInt(emiDay, 10) : undefined,
            loanTenureMonths: loanTenureMonths ? parseInt(loanTenureMonths, 10) : undefined,
            minimumPaymentAmount: minimumPaymentAmount ? parseFloat(minimumPaymentAmount) : undefined,
            notes: notes || undefined,
        };

        await persistence.handleSave(
            accountName,
            accountType,
            accountSubtype,
            selectedCurrency,
            selectedIcon,
            initialBalance,
            balanceDataPayload,
            parentAccountId || undefined,
            metadata
        );
    };

    // UI Derived State
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

    const potentialParents = useMemo(() => {
        return accounts
            .filter(a => {
                return (
                    a.id !== accountId && // Not self
                    a.accountType === accountType && // Same type
                    a.currencyCode === selectedCurrency && // Same currency
                    !a.deletedAt // Not deleted
                );
            });
    }, [accounts, accountId, accountType, selectedCurrency]);

    const parentAccountName = useMemo(() => {
        if (!parentAccountId) return 'None';
        const parent = potentialParents.find(a => a.id === parentAccountId);
        return parent ? parent.name : 'None';
    }, [parentAccountId, potentialParents]);

    const effectiveIsParent = isParent;
    const showCurrency = true;
    const showBalance = !effectiveIsParent;

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
    };
}
