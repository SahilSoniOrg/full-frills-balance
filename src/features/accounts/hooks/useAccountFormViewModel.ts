import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, {
  AccountSubtype,
  AccountType,
  getAccountSubtypesForType,
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
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import {
  accountFormDraftReducer,
  createAccountFormDraft,
  coreFromDefaults,
  mapAccountToCoreDraft,
  mapBalanceToDraftBalance,
  mapMetadataToDraft,
  shouldSeedAccountBalanceDraft,
  shouldSeedAccountCoreDraft,
  shouldSeedAccountMetadataDraft,
} from '@/src/features/accounts/hooks/accountFormDraft';
import {
  buildAccountSavePayload,
  resolveAccountFormDefaults,
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
import { useCallback, useMemo, useReducer } from 'react';
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

/**
 * Account create/edit form.
 * Draft fields live in an id-keyed reducer: seeded once per `accountId` from
 * observe. Later observe ticks never overwrite a dirty draft (charting lock).
 */
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

  const { account: existingAccount, isLoading: isAccountLoading } = useAccount(
    accountId || null,
    workplaceId,
  );
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

  const [draft, dispatch] = useReducer(
    accountFormDraftReducer,
    createFormDefaults,
    createAccountFormDraft,
  );

  const {
    core,
    metadata: metadataValues,
    pickers,
    balanceClassify: balanceClassifyDraft,
    localFormError,
    seededAccountId,
    seededBalanceAccountId,
    seededMetadataAccountId,
  } = draft;

  // Seed once per entity id during render — never on every observe tick.
  // One dispatch per render (React discards + re-renders on mid-render setState).
  const canSeedCore = shouldSeedAccountCoreDraft({
    accountId,
    seededAccountId,
    existingAccount,
  });
  const canSeedBalance = shouldSeedAccountBalanceDraft({
    accountId,
    seededBalanceAccountId,
    balanceData,
  });
  const canSeedMetadata = shouldSeedAccountMetadataDraft({
    accountId,
    seededMetadataAccountId,
    existingMetadata,
  });

  if (canSeedCore && existingAccount && accountId) {
    dispatch({
      type: 'SEED_EDIT_CORE',
      accountId,
      core: mapAccountToCoreDraft(existingAccount, routeContext, workplaceCurrency),
    });
  } else if (!accountId && seededAccountId !== null) {
    dispatch({ type: 'SEED_CREATE', core: coreFromDefaults(createFormDefaults) });
  } else if (canSeedBalance && accountId && balanceData) {
    dispatch({
      type: 'SEED_BALANCE',
      accountId,
      initialBalance: mapBalanceToDraftBalance(balanceData),
    });
  } else if (canSeedMetadata && accountId && existingMetadata) {
    dispatch({
      type: 'SEED_METADATA',
      accountId,
      metadata: mapMetadataToDraft(existingMetadata),
    });
  }

  const {
    accountName,
    accountType,
    accountSubtype,
    selectedCurrency,
    selectedIcon,
    initialBalance,
    parentAccountId,
  } = core;

  const validation = useAccountValidation(accountName, accounts, accountId);

  const persistence = useAccountPersistence(
    workplaceId,
    existingAccount,
    accountId,
    accounts.length > 0,
  );

  const setAccountName = useCallback(
    (value: string) => dispatch({ type: 'PATCH_CORE', patch: { accountName: value } }),
    [],
  );
  const onAccountTypeChange = useCallback(
    (value: AccountType) => dispatch({ type: 'SET_ACCOUNT_TYPE', accountType: value }),
    [],
  );
  const onAccountSubtypeChange = useCallback(
    (value: AccountSubtype) => dispatch({ type: 'PATCH_CORE', patch: { accountSubtype: value } }),
    [],
  );
  const setSelectedCurrency = useCallback(
    (value: string) => dispatch({ type: 'PATCH_CORE', patch: { selectedCurrency: value } }),
    [],
  );
  const setSelectedIcon = useCallback(
    (value: IconName) => dispatch({ type: 'PATCH_CORE', patch: { selectedIcon: value } }),
    [],
  );
  const setParentAccountId = useCallback(
    (value: AccountId) => dispatch({ type: 'PATCH_CORE', patch: { parentAccountId: value } }),
    [],
  );

  const onInitialBalanceChange = useCallback(
    (value: string) => {
      if (isCategoryAccountType(accountType)) return;
      dispatch({ type: 'PATCH_CORE', patch: { initialBalance: value } });
    },
    [accountType],
  );

  const updateMetadataField = useCallback(
    <K extends keyof typeof metadataValues>(key: K, value: (typeof metadataValues)[K]) => {
      dispatch({ type: 'PATCH_METADATA', key, value });
      if (localFormError) dispatch({ type: 'SET_LOCAL_ERROR', error: null });
    },
    [localFormError],
  );

  const setIsIconPickerVisible = useCallback(
    (visible: boolean) => dispatch({ type: 'SET_PICKER', picker: 'isIconPickerVisible', visible }),
    [],
  );
  const setIsParentPickerVisible = useCallback(
    (visible: boolean) =>
      dispatch({ type: 'SET_PICKER', picker: 'isParentPickerVisible', visible }),
    [],
  );
  const setIsPayFromPickerVisible = useCallback(
    (visible: boolean) =>
      dispatch({ type: 'SET_PICKER', picker: 'isPayFromPickerVisible', visible }),
    [],
  );

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
        dispatch({ type: 'SET_LOCAL_ERROR', error: saveResult.error });
        dispatch({ type: 'HIDE_BALANCE_CLASSIFY' });
        return;
      }

      const { payload } = saveResult;
      const targetBalance = payload.initialBalance ? parseFloat(payload.initialBalance) : NaN;
      const currentBalance = payload.balanceData?.balance;
      const balanceChanged =
        isEditMode &&
        currentBalance !== undefined &&
        isBalanceChangedBeyondEpsilon(targetBalance, currentBalance);

      if (
        !balanceChange &&
        balanceChanged &&
        needsBalanceChangeClassification(payload.accountType)
      ) {
        dispatch({
          type: 'SHOW_BALANCE_CLASSIFY',
          discrepancy: targetBalance - currentBalance,
        });
        return;
      }

      dispatch({ type: 'HIDE_BALANCE_CLASSIFY' });
      try {
        await persistence.handleSave({ payload, balanceChange });
      } catch (error) {
        showErrorAlert(
          error instanceof ValidationError ? error : new ValidationError('Failed to save account'),
        );
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
    dispatch({ type: 'HIDE_BALANCE_CLASSIFY' });
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
      setStatementDay: v => updateMetadataField('statementDay', v),
      dueDay: metadataValues.dueDay,
      setDueDay: v => updateMetadataField('dueDay', v),
      creditLimitAmount: metadataValues.creditLimitAmount,
      setCreditLimitAmount: v => updateMetadataField('creditLimitAmount', v),
      apr: metadataValues.apr,
      setApr: v => updateMetadataField('apr', v),
      emiDay: metadataValues.emiDay,
      setEmiDay: v => updateMetadataField('emiDay', v),
      loanTenureMonths: metadataValues.loanTenureMonths,
      setLoanTenureMonths: v => updateMetadataField('loanTenureMonths', v),
      minimumPaymentAmount: metadataValues.minimumPaymentAmount,
      setMinimumPaymentAmount: v => updateMetadataField('minimumPaymentAmount', v),
      minimumPaymentPercent: metadataValues.minimumPaymentPercent,
      setMinimumPaymentPercent: v => updateMetadataField('minimumPaymentPercent', v),
      payFromAccountId: metadataValues.payFromAccountId,
      payFromAccountName,
      setPayFromAccountId: v => updateMetadataField('payFromAccountId', v),
      isPayFromPickerVisible: pickers.isPayFromPickerVisible,
      setIsPayFromPickerVisible,
      notes: metadataValues.notes,
      setNotes: v => updateMetadataField('notes', v),
      isMinPaymentOnly: metadataValues.isMinPaymentOnly,
      setIsMinPaymentOnly: v => updateMetadataField('isMinPaymentOnly', v),
    }),
    [
      metadataValues,
      updateMetadataField,
      payFromAccountName,
      pickers.isPayFromPickerVisible,
      setIsPayFromPickerVisible,
    ],
  );

  const balanceClassify = useMemo(() => {
    if (!accountId || !balanceClassifyDraft.visible) return null;
    const absDelta = Math.abs(balanceClassifyDraft.discrepancy);
    const signedLabel = CurrencyFormatter.formatAmount(absDelta, selectedCurrency);
    const discrepancyLabel =
      balanceClassifyDraft.discrepancy >= 0 ? `+${signedLabel}` : `−${signedLabel}`;

    return {
      visible: true,
      accounts,
      editedAccountId: accountId,
      editedAccountName: accountName.trim() || 'This account',
      editedAccountType: accountType,
      currencyCode: selectedCurrency,
      discrepancy: balanceClassifyDraft.discrepancy,
      discrepancyLabel,
      onClose: onBalanceClassifyClose,
      onSelect: onBalanceClassifySelect,
    };
  }, [
    accountId,
    accountName,
    balanceClassifyDraft,
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
    isIconPickerVisible: pickers.isIconPickerVisible,
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
    isParentPickerVisible: pickers.isParentPickerVisible,
    setIsParentPickerVisible,
    isParent: effectiveIsParent,
    showCurrency,
    metadata,
    isLoading: isAccountLoading || isBalanceLoading || isMetadataLoading,
    balanceClassify,
  };
}
