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
import {
  AccountMetadataValues,
  createDefaultAccountMetadataValues,
  resolveAccountIcon,
  serializeAccountMetadata,
  validateAccountMetadata,
} from '@/src/features/accounts/services/accountMetadataDomain';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams, usePathname } from 'expo-router';
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
  minimumPaymentPercent: string;
  setMinimumPaymentAmount: (value: string) => void;
  setMinimumPaymentPercent: (value: string) => void;
  payFromAccountId: AccountId;
  payFromAccountName: string;
  setPayFromAccountId: (value: AccountId) => void;
  isPayFromPickerVisible: boolean;
  setIsPayFromPickerVisible: (visible: boolean) => void;
  notes: string;
  setNotes: (value: string) => void;
  isMinPaymentOnly: boolean;
  setIsMinPaymentOnly: (value: boolean) => void;
}

export interface AccountFormViewModel {
  heroTitle: string;
  heroSubtitle: string;
  isEditMode: boolean;
  isCategory: boolean;
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
  const { data: metadataRecords, isLoading: isMetadataLoading } = useObservable(
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

  const pathname = usePathname();

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
    if (pathname.includes('category-creation')) {
      return AccountType.EXPENSE;
    }
    return AccountType.ASSET;
  };

  const initialType = getInitialAccountType();

  // Form State
  const [accountName, setAccountName] = useState(pName || '');
  const [accountType, setAccountType] = useState<AccountType>(initialType);
  const [accountSubtype, setAccountSubtype] = useState<AccountSubtype>(
    getDefaultSubtypeForType(initialType),
  );
  const [selectedCurrency, setSelectedCurrency] = useState<string>(pCurrency || workplaceCurrency);
  const [selectedIcon, setSelectedIcon] = useState<IconName>(
    resolveAccountIcon(initialType, (pIcon as IconName) || null),
  );
  const [initialBalance, setInitialBalance] = useState('');
  const [parentAccountId, setParentAccountId] = useState(EMPTY_ACCOUNT_ID);
  const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);
  const [isParentPickerVisible, setIsParentPickerVisible] = useState(false);
  const [isPayFromPickerVisible, setIsPayFromPickerVisible] = useState(false);
  const hasInjectedAccountRef = useRef(false);
  const hasInjectedBalanceRef = useRef(false);
  const hasInjectedMetadataRef = useRef(false);

  // Consolidated Domain Metadata State
  const [metadataValues, setMetadataValues] = useState<AccountMetadataValues>(() =>
    createDefaultAccountMetadataValues(null),
  );

  const updateMetadataValue = <K extends keyof AccountMetadataValues>(
    key: K,
    value: AccountMetadataValues[K],
  ) => {
    setMetadataValues(prev => ({ ...prev, [key]: value }));
    if (localFormError) setLocalFormError(null);
  };

  const [localFormError, setLocalFormError] = useState<string | null>(null);

  // Load existing account base data
  useEffect(() => {
    if (existingAccount && !hasInjectedAccountRef.current) {
      hasInjectedAccountRef.current = true;
      setAccountName(existingAccount.name);
      setAccountType(existingAccount.accountType);
      setAccountSubtype(
        existingAccount.accountSubtype || getDefaultSubtypeForType(existingAccount.accountType),
      );
      setSelectedCurrency(existingAccount.currencyCode);
      setSelectedIcon(resolveAccountIcon(existingAccount.accountType, existingAccount.icon));
      setParentAccountId(existingAccount.parentAccountId || EMPTY_ACCOUNT_ID);
    }
  }, [existingAccount, accountVersion]);

  // Load existing balance
  useEffect(() => {
    if (balanceData && !hasInjectedBalanceRef.current) {
      hasInjectedBalanceRef.current = true;
      setInitialBalance(balanceData.balance.toString());
    }
  }, [balanceData]);

  // Load existing metadata
  useEffect(() => {
    if (existingMetadata && !hasInjectedMetadataRef.current) {
      hasInjectedMetadataRef.current = true;
      setMetadataValues(createDefaultAccountMetadataValues(existingMetadata));
    }
  }, [existingMetadata]);

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

    const isCurrentCategory =
      accountType === AccountType.INCOME || accountType === AccountType.EXPENSE;

    if (!isCurrentCategory && initialBalance && isNaN(Number(initialBalance))) {
      setLocalFormError('Initial balance must be a number');
      return;
    }

    const metadataError = validateAccountMetadata(metadataValues, accountType);
    if (metadataError) {
      setLocalFormError(metadataError);
      return;
    }

    const metadataPayload = serializeAccountMetadata(
      metadataValues,
      accountType,
      Boolean(existingMetadata),
    );

    try {
      await persistence.handleSave(
        accountName,
        accountType,
        accountSubtype,
        selectedCurrency,
        selectedIcon,
        isCurrentCategory ? '' : initialBalance,
        isCurrentCategory ? undefined : balanceData || undefined,
        parentAccountId || undefined,
        metadataPayload,
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
    ? accountType === AccountType.INCOME || accountType === AccountType.EXPENSE
      ? AppConfig.strings.accounts.categoryForm.formTitleEdit
      : 'Edit Account'
    : accountType === AccountType.INCOME || accountType === AccountType.EXPENSE
      ? AppConfig.strings.accounts.categoryForm.formTitleNew
      : hasExistingAccounts
        ? 'Create New Account'
        : 'Create Your First Account';
  const heroSubtitle =
    accountType === AccountType.INCOME || accountType === AccountType.EXPENSE
      ? ''
      : isEditMode
        ? 'Update your account details'
        : hasExistingAccounts
          ? 'Add another source of funds'
          : 'Start tracking your finances';

  const saveLabel = isEditMode
    ? accountType === AccountType.INCOME || accountType === AccountType.EXPENSE
      ? AppConfig.strings.accounts.categoryForm.saveChanges
      : 'Save Changes'
    : accountType === AccountType.INCOME || accountType === AccountType.EXPENSE
      ? AppConfig.strings.accounts.categoryForm.createCategory
      : 'Create Account';

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
    if (!metadataValues.payFromAccountId) return AppConfig.strings.common.none;
    const account = accounts.find(a => a.id === metadataValues.payFromAccountId);
    return account ? account.name : AppConfig.strings.common.none;
  }, [metadataValues.payFromAccountId, accounts]);

  const effectiveIsParent = isParent;
  const isCurrentCategory =
    accountType === AccountType.INCOME || accountType === AccountType.EXPENSE;
  const showCurrency = !isCurrentCategory;
  const showBalance = !isCurrentCategory && !effectiveIsParent;

  const availableSubtypes = useMemo(() => {
    return getAccountSubtypesForType(accountType);
  }, [accountType]);

  return {
    heroTitle,
    heroSubtitle,
    isEditMode,
    isCategory: isCurrentCategory,
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
      statementDay: metadataValues.statementDay,
      setStatementDay: v => updateMetadataValue('statementDay', v),
      dueDay: metadataValues.dueDay,
      setDueDay: v => updateMetadataValue('dueDay', v),
      creditLimitAmount: metadataValues.creditLimitAmount,
      setCreditLimitAmount: v => updateMetadataValue('creditLimitAmount', v),
      apr: metadataValues.apr,
      setApr: v => updateMetadataValue('apr', v),
      emiDay: metadataValues.emiDay,
      setEmiDay: v => updateMetadataValue('emiDay', v),
      loanTenureMonths: metadataValues.loanTenureMonths,
      setLoanTenureMonths: v => updateMetadataValue('loanTenureMonths', v),
      minimumPaymentAmount: metadataValues.minimumPaymentAmount,
      setMinimumPaymentAmount: v => updateMetadataValue('minimumPaymentAmount', v),
      minimumPaymentPercent: metadataValues.minimumPaymentPercent,
      setMinimumPaymentPercent: v => updateMetadataValue('minimumPaymentPercent', v),
      payFromAccountId: metadataValues.payFromAccountId,
      payFromAccountName,
      setPayFromAccountId: v => updateMetadataValue('payFromAccountId', v),
      isPayFromPickerVisible,
      setIsPayFromPickerVisible,
      notes: metadataValues.notes,
      setNotes: v => updateMetadataValue('notes', v),
      isMinPaymentOnly: metadataValues.isMinPaymentOnly,
      setIsMinPaymentOnly: v => updateMetadataValue('isMinPaymentOnly', v),
    },
    isLoading: isAccountLoading || isBalanceLoading || isMetadataLoading,
  };
}
