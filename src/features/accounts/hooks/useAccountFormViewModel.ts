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
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import {
  useAccount,
  useAccountBalance,
  useAccounts,
} from '@/src/features/accounts/hooks/useAccounts';
import {
  filterPayFromAccountOptions,
  filterPotentialParentAccounts,
  isCategoryAccountType,
  resolveAccountFormHeroCopy,
} from '@/src/features/accounts/helpers/accountFormHelpers';
import { useAccountMetadataForm } from '@/src/features/accounts/hooks/useAccountMetadataForm';
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import {
  buildAccountSavePayload,
  resolveAccountFormDefaults,
  resolveAccountInitialBalance,
} from '@/src/features/accounts/services/accountFormService';
import {
  BalanceChangeCounterparty,
  isBalanceChangedBeyondEpsilon,
  needsBalanceChangeClassification,
} from '@/src/services/accounts/balanceChangeClassification';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { AccountId } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  balanceClassify: {
    visible: boolean;
    accounts: Account[];
    editedAccountId: AccountId;
    editedAccountName: string;
    editedAccountType: AccountType;
    currencyCode: string;
    discrepancy: number;
    discrepancyLabel: string;
    onClose: () => void;
    onSelect: (counterparty: BalanceChangeCounterparty) => void;
  } | null;
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
    () => (accountId ? accountQueries.observeHasChildren(workplaceId, accountId) : of(false)),
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

  const routeContext = useMemo(
    () => ({
      pathname,
      typeParam,
      previewName: pName,
      previewType: pType,
      previewCurrency: pCurrency,
      previewIcon: pIcon,
    }),
    [pathname, typeParam, pName, pType, pCurrency, pIcon],
  );

  const createFormDefaults = useMemo(
    () => resolveAccountFormDefaults(routeContext, workplaceCurrency),
    [routeContext, workplaceCurrency],
  );

  // Form State
  const [accountName, setAccountName] = useState(createFormDefaults.accountName);
  const [accountType, setAccountType] = useState<AccountType>(createFormDefaults.accountType);
  const [accountSubtype, setAccountSubtype] = useState<AccountSubtype>(
    createFormDefaults.accountSubtype,
  );
  const [selectedCurrency, setSelectedCurrency] = useState<string>(
    createFormDefaults.selectedCurrency,
  );
  const [selectedIcon, setSelectedIcon] = useState<IconName>(createFormDefaults.selectedIcon);
  const [initialBalance, setInitialBalance] = useState('');
  const [parentAccountId, setParentAccountId] = useState(createFormDefaults.parentAccountId);
  const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);
  const [isParentPickerVisible, setIsParentPickerVisible] = useState(false);
  const [isPayFromPickerVisible, setIsPayFromPickerVisible] = useState(false);
  const [isBalanceClassifyVisible, setIsBalanceClassifyVisible] = useState(false);
  const [pendingBalanceDiscrepancy, setPendingBalanceDiscrepancy] = useState(0);
  const hasInjectedAccountRef = useRef(false);
  const hasInjectedBalanceRef = useRef(false);

  const [localFormError, setLocalFormError] = useState<string | null>(null);
  const clearLocalError = useCallback(() => setLocalFormError(null), []);

  const metadataForm = useAccountMetadataForm(existingMetadata, clearLocalError);
  const metadataValues = metadataForm.values;

  // Load existing account base data
  useEffect(() => {
    if (existingAccount && !hasInjectedAccountRef.current) {
      hasInjectedAccountRef.current = true;
      const defaults = resolveAccountFormDefaults(routeContext, workplaceCurrency, existingAccount);
      setAccountName(defaults.accountName);
      setAccountType(defaults.accountType);
      setAccountSubtype(defaults.accountSubtype);
      setSelectedCurrency(defaults.selectedCurrency);
      setSelectedIcon(defaults.selectedIcon);
      setParentAccountId(defaults.parentAccountId);
    }
  }, [existingAccount, accountVersion, routeContext, workplaceCurrency]);

  // Load existing balance
  useEffect(() => {
    if (balanceData && !hasInjectedBalanceRef.current) {
      hasInjectedBalanceRef.current = true;
      setInitialBalance(resolveAccountInitialBalance(balanceData));
    }
  }, [balanceData]);

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
    // Income/Expense category amounts are not editable.
    if (isCategoryAccountType(accountType)) return;
    setInitialBalance(value);
    if (localFormError) setLocalFormError(null);
  };

  const commitSave = useCallback(
    async (balanceChange?: BalanceChangeCounterparty) => {
      logger.info(`Saving account: ${accountName} (ID: ${accountId || 'new'})`);

      const saveResult = buildAccountSavePayload({
        accountName,
        accountType,
        accountSubtype,
        selectedCurrency,
        selectedIcon,
        initialBalance,
        parentAccountId,
        metadataValues,
        hasExistingMetadata: Boolean(existingMetadata),
        balanceData,
      });

      if (!saveResult.ok) {
        setLocalFormError(saveResult.error);
        setIsBalanceClassifyVisible(false);
        setPendingBalanceDiscrepancy(0);
        return;
      }

      const { payload } = saveResult;
      const targetBalance = payload.initialBalance ? parseFloat(payload.initialBalance) : NaN;
      const currentBalance = payload.balanceData?.balance;
      const balanceChanged =
        isEditMode &&
        currentBalance !== undefined &&
        isBalanceChangedBeyondEpsilon(targetBalance, currentBalance);

      // Edit + balance change on Asset/Liability/Equity → classify before save.
      if (
        !balanceChange &&
        balanceChanged &&
        needsBalanceChangeClassification(payload.accountType)
      ) {
        setPendingBalanceDiscrepancy(targetBalance - currentBalance);
        setIsBalanceClassifyVisible(true);
        return;
      }

      setIsBalanceClassifyVisible(false);
      try {
        await persistence.handleSave({ payload, balanceChange });
      } catch (error) {
        showErrorAlert(
          error instanceof ValidationError ? error : new ValidationError('Failed to save account'),
        );
      } finally {
        setPendingBalanceDiscrepancy(0);
      }
    },
    [
      accountName,
      accountId,
      accountType,
      accountSubtype,
      selectedCurrency,
      selectedIcon,
      initialBalance,
      parentAccountId,
      metadataValues,
      existingMetadata,
      balanceData,
      isEditMode,
      persistence,
    ],
  );

  const onSave = useCallback(() => {
    void commitSave();
  }, [commitSave]);

  const onBalanceClassifyClose = useCallback(() => {
    setIsBalanceClassifyVisible(false);
    setPendingBalanceDiscrepancy(0);
  }, []);

  const onBalanceClassifySelect = useCallback(
    (counterparty: BalanceChangeCounterparty) => {
      void commitSave(counterparty);
    },
    [commitSave],
  );

  const hasExistingAccounts = accounts.length > 0;
  const { heroTitle, heroSubtitle, saveLabel } = resolveAccountFormHeroCopy({
    isEditMode,
    accountType,
    hasExistingAccounts,
  });

  const currencyLabel = useMemo(() => {
    return `Currency${isEditMode ? ' (cannot be changed)' : ''}`;
  }, [isEditMode]);

  const potentialParents = useMemo(
    () =>
      filterPotentialParentAccounts(accounts, {
        accountId,
        accountType,
        selectedCurrency,
      }),
    [accounts, accountId, accountType, selectedCurrency],
  );

  const parentAccountName = useMemo(() => {
    if (!parentAccountId) return AppConfig.strings.common.none;
    const parent = potentialParents.find(a => a.id === parentAccountId);
    return parent ? parent.name : AppConfig.strings.common.none;
  }, [parentAccountId, potentialParents]);

  const payFromAccountOptions = useMemo(
    () => filterPayFromAccountOptions(accounts, accountId),
    [accounts, accountId],
  );

  const payFromAccountName = useMemo(() => {
    if (!metadataValues.payFromAccountId) return AppConfig.strings.common.none;
    const account = accounts.find(a => a.id === metadataValues.payFromAccountId);
    return account ? account.name : AppConfig.strings.common.none;
  }, [metadataValues.payFromAccountId, accounts]);

  const effectiveIsParent = isParent;
  const isCurrentCategory = isCategoryAccountType(accountType);
  const showCurrency = !isCurrentCategory;
  const showBalance = !isCurrentCategory && !effectiveIsParent;

  const availableSubtypes = useMemo(() => {
    return getAccountSubtypesForType(accountType);
  }, [accountType]);

  const metadata = useMemo(
    (): AccountMetadataFormModel => ({
      statementDay: metadataValues.statementDay,
      setStatementDay: v => metadataForm.updateField('statementDay', v),
      dueDay: metadataValues.dueDay,
      setDueDay: v => metadataForm.updateField('dueDay', v),
      creditLimitAmount: metadataValues.creditLimitAmount,
      setCreditLimitAmount: v => metadataForm.updateField('creditLimitAmount', v),
      apr: metadataValues.apr,
      setApr: v => metadataForm.updateField('apr', v),
      emiDay: metadataValues.emiDay,
      setEmiDay: v => metadataForm.updateField('emiDay', v),
      loanTenureMonths: metadataValues.loanTenureMonths,
      setLoanTenureMonths: v => metadataForm.updateField('loanTenureMonths', v),
      minimumPaymentAmount: metadataValues.minimumPaymentAmount,
      setMinimumPaymentAmount: v => metadataForm.updateField('minimumPaymentAmount', v),
      minimumPaymentPercent: metadataValues.minimumPaymentPercent,
      setMinimumPaymentPercent: v => metadataForm.updateField('minimumPaymentPercent', v),
      payFromAccountId: metadataValues.payFromAccountId,
      payFromAccountName,
      setPayFromAccountId: v => metadataForm.updateField('payFromAccountId', v),
      isPayFromPickerVisible,
      setIsPayFromPickerVisible,
      notes: metadataValues.notes,
      setNotes: v => metadataForm.updateField('notes', v),
      isMinPaymentOnly: metadataValues.isMinPaymentOnly,
      setIsMinPaymentOnly: v => metadataForm.updateField('isMinPaymentOnly', v),
    }),
    [metadataValues, metadataForm.updateField, payFromAccountName, isPayFromPickerVisible],
  );

  const balanceClassify = useMemo(() => {
    if (!accountId || !isBalanceClassifyVisible) return null;
    const absDelta = Math.abs(pendingBalanceDiscrepancy);
    const signedLabel = CurrencyFormatter.formatAmount(absDelta, selectedCurrency);
    const discrepancyLabel = pendingBalanceDiscrepancy >= 0 ? `+${signedLabel}` : `−${signedLabel}`;

    return {
      visible: true,
      accounts,
      editedAccountId: accountId,
      editedAccountName: accountName.trim() || 'This account',
      editedAccountType: accountType,
      currencyCode: selectedCurrency,
      discrepancy: pendingBalanceDiscrepancy,
      discrepancyLabel,
      onClose: onBalanceClassifyClose,
      onSelect: onBalanceClassifySelect,
    };
  }, [
    accountId,
    accountName,
    isBalanceClassifyVisible,
    pendingBalanceDiscrepancy,
    selectedCurrency,
    accounts,
    accountType,
    onBalanceClassifyClose,
    onBalanceClassifySelect,
  ]);

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
    metadata,
    isLoading: isAccountLoading || isBalanceLoading || isMetadataLoading,
    balanceClassify,
  };
}
