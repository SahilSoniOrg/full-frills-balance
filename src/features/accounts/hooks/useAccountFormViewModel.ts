import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, {
  AccountSubtype,
  AccountType,
  getAccountSubtypesForType,
  getDefaultSubtypeForType,
} from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import Currency from '@/src/data/models/Currency';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import {
  useAccount,
  useAccountBalance,
  useAccounts,
} from '@/src/features/accounts/hooks/useAccounts';
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { of } from 'rxjs';

export interface AccountMetadataFormModel {
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
  payFromAccountId: AccountId;
  payFromAccountName: string;
  setPayFromAccountId: (value: AccountId) => void;
  isPayFromPickerVisible: boolean;
  setIsPayFromPickerVisible: (visible: boolean) => void;
  notes: string;
  setNotes: (value: string) => void;
  isMinPaymentOnly: boolean;
  setIsMinPaymentOnly: (value: boolean) => void;
  minimumPaymentPercent: string;
  setMinimumPaymentPercent: (value: string) => void;
}

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
  parentAccountId: AccountId;
  parentAccountName: string;
  setParentAccountId: (value: AccountId) => void;
  potentialParents: Account[];
  payFromAccountOptions: Account[];
  isParentPickerVisible: boolean;
  setIsParentPickerVisible: (visible: boolean) => void;
  isParent: boolean;
  showCurrency: boolean;
  metadata: AccountMetadataFormModel;
  isLoading: boolean;
}

export function useAccountFormViewModel(): AccountFormViewModel {
  const params = useLocalSearchParams<{
    accountId: AccountId;
    type: string;
    pName: string;
    pType: string;
    pCurrency: string;
    pIcon: string;
  }>();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const accountId = params.accountId;
  const typeParam = params.type;
  const isEditMode = Boolean(accountId);

  const {
    account: existingAccount,
    version: accountVersion,
    isLoading: isAccountLoading,
  } = useAccount(accountId || null, workplaceId);
  const { balanceData, isLoading: isBalanceLoading } = useAccountBalance(
    workplaceId,
    accountId || null,
    workplaceCurrency,
  );
  const { accounts } = useAccounts(workplaceId);

  const { data: isParent } = useObservable(
    () => (accountId ? accountRepository.observeHasChildren(workplaceId, accountId) : of(false)),
    [accountId, workplaceId],
    false,
  );

  const { currencies } = useCurrencies();
  const { data: metadataRecords } = useObservable(
    () => (existingAccount ? existingAccount.metadataRecords.observe() : of([])),
    [existingAccount],
    [] as AccountMetadata[],
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
    getDefaultSubtypeForType(getInitialAccountType()),
  );
  const [selectedCurrency, setSelectedCurrency] = useState<string>(pCurrency || workplaceCurrency);
  const [selectedIcon, setSelectedIcon] = useState<IconName>((pIcon as IconName) || 'wallet');
  const [initialBalance, setInitialBalance] = useState('');
  const [parentAccountId, setParentAccountId] = useState(EMPTY_ACCOUNT_ID);
  const [payFromAccountId, setPayFromAccountId] = useState(EMPTY_ACCOUNT_ID);
  const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);
  const [isParentPickerVisible, setIsParentPickerVisible] = useState(false);
  const [isPayFromPickerVisible, setIsPayFromPickerVisible] = useState(false);
  const hasInjectedRef = useRef(false);

  // Metadata State
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [creditLimitAmount, setCreditLimitAmount] = useState('');
  const [apr, setApr] = useState('');
  const [emiDay, setEmiDay] = useState('');
  const [loanTenureMonths, setLoanTenureMonths] = useState('');
  const [minimumPaymentAmount, setMinimumPaymentAmount] = useState('');
  const [minimumPaymentPercent, setMinimumPaymentPercent] = useState('');
  const [isMinPaymentOnly, setIsMinPaymentOnly] = useState(false);
  const [notes, setNotes] = useState('');

  const [localFormError, setLocalFormError] = useState<string | null>(null);

  // Load existing account data
  useEffect(() => {
    if (existingAccount) {
      setAccountName(existingAccount.name);
      setAccountType(existingAccount.accountType);
      setAccountSubtype(
        existingAccount.accountSubtype || getDefaultSubtypeForType(existingAccount.accountType),
      );
      setSelectedCurrency(existingAccount.currencyCode);
      setSelectedIcon(existingAccount.icon || 'wallet');
      setParentAccountId(existingAccount.parentAccountId || EMPTY_ACCOUNT_ID);

      if (balanceData && initialBalance === '' && !hasInjectedRef.current) {
        setInitialBalance(balanceData.balance.toString());
      }

      // Load metadata
      if (existingMetadata && !hasInjectedRef.current) {
        setStatementDay(existingMetadata.statementDay?.toString() || '');
        setDueDay(existingMetadata.dueDay?.toString() || '');
        setCreditLimitAmount(existingMetadata.creditLimitAmount?.toString() || '');
        // apr is managed as aprBps in the repo persistence input, but let's see what model has
        setApr(existingMetadata.aprBps ? (existingMetadata.aprBps / 100).toString() : '');
        setEmiDay(existingMetadata.emiDay?.toString() || '');
        setLoanTenureMonths(existingMetadata.loanTenureMonths?.toString() || '');
        setMinimumPaymentAmount(existingMetadata.minimumPaymentAmount?.toString() || '');
        setMinimumPaymentPercent(existingMetadata.minimumPaymentPercent?.toString() || '');
        setIsMinPaymentOnly(existingMetadata.minPaymentOnly || false);
        setPayFromAccountId(existingMetadata.payFromAccountId || EMPTY_ACCOUNT_ID);
        setNotes(existingMetadata.notes || '');
      }

      if (existingAccount && (balanceData || !isBalanceLoading)) {
        hasInjectedRef.current = true;
      }
    }
  }, [
    existingAccount,
    accountVersion,
    existingMetadata,
    balanceData,
    initialBalance,
    isBalanceLoading,
  ]);

  const validation = useAccountValidation(accountName, accounts, accountId);

  const persistence = useAccountPersistence(
    workplaceId,
    existingAccount,
    accountId,
    accounts.length > 0,
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
    if (localFormError) setLocalFormError(null);
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

      if (minimumPaymentPercent) {
        const percent = parseFloat(minimumPaymentPercent);
        if (isNaN(percent) || percent < 0 || percent > 100) {
          setLocalFormError('Minimum payment percent must be between 0 and 100');
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
    if (minimumPaymentPercent) metadata.minimumPaymentPercent = parseFloat(minimumPaymentPercent);
    metadata.minPaymentOnly = isMinPaymentOnly;
    if (payFromAccountId) metadata.payFromAccountId = payFromAccountId;
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
        Object.keys(metadata).length > 0 ? metadata : undefined,
      );

      // Note: handleSave in persistence already calls router.back()
    } catch (error) {
      showErrorAlert(
        error instanceof ValidationError ? error : new ValidationError('Failed to save account'),
      );
    }
  };

  const hasExistingAccounts = accounts.length > 0;
  const heroTitle = isEditMode
    ? 'Edit Account'
    : hasExistingAccounts
      ? 'Create New Account'
      : 'Create Your First Account';
  const heroSubtitle = isEditMode
    ? 'Update your account details'
    : hasExistingAccounts
      ? 'Add another source of funds'
      : 'Start tracking your finances';

  const saveLabel = isEditMode ? 'Save Changes' : 'Create Account';

  const currencyLabel = useMemo(() => {
    return `Currency${isEditMode ? ' (cannot be changed)' : ''}`;
  }, [isEditMode]);

  const potentialParents = useMemo(() => {
    return accounts.filter(
      a =>
        a.id !== accountId &&
        a.accountType === accountType &&
        a.currencyCode === selectedCurrency &&
        !a.parentAccountId,
    );
  }, [accounts, accountId, accountType, selectedCurrency]);

  const parentAccountName = useMemo(() => {
    if (!parentAccountId) return AppConfig.strings.common.none;
    const parent = potentialParents.find(a => a.id === parentAccountId);
    return parent ? parent.name : AppConfig.strings.common.none;
  }, [parentAccountId, potentialParents]);
  const payFromAccountOptions = useMemo(() => {
    return accounts.filter(a => a.accountType === AccountType.ASSET && a.id !== accountId);
  }, [accounts, accountId]);
  const payFromAccountName = useMemo(() => {
    if (!payFromAccountId) return AppConfig.strings.common.none;
    const account = accounts.find(a => a.id === payFromAccountId);
    return account ? account.name : AppConfig.strings.common.none;
  }, [payFromAccountId, accounts]);

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
    isSaveDisabled:
      !accountName.trim() || persistence.isCreating || !!validation.formError || !!localFormError,
    parentAccountId,
    parentAccountName,
    setParentAccountId,
    potentialParents,
    payFromAccountOptions,
    isParentPickerVisible,
    setIsParentPickerVisible,
    isParent: effectiveIsParent,
    showCurrency,
    metadata: {
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
      payFromAccountId,
      payFromAccountName,
      setPayFromAccountId,
      isPayFromPickerVisible,
      setIsPayFromPickerVisible,
      notes,
      setNotes,
      isMinPaymentOnly,
      setIsMinPaymentOnly,
      minimumPaymentPercent,
      setMinimumPaymentPercent,
    },
    isLoading: isAccountLoading || isBalanceLoading,
  };
}
