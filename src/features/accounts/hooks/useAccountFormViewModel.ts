import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  AccountId,
  AccountSubtype,
  AccountType,
  type AccountFields as Account,
  type PlainAccountMetadata as AccountMetadata,
  type PlainCurrency as Currency,
} from '@/src/types/domain';
import {
  filterPayFromAccountOptions,
  filterPotentialParentAccounts,
  resolveAccountFormHeroCopy,
  resolveAllowedAccountTypes,
} from '@/src/features/accounts/helpers/accountFormHelpers';
import { useAccountFormBalanceClassify } from '@/src/features/accounts/hooks/form/useAccountFormBalanceClassify';
import { useAccountFormCore } from '@/src/features/accounts/hooks/form/useAccountFormCore';
import { useAccountFormDraft } from '@/src/features/accounts/hooks/form/useAccountFormDraft';
import {
  AccountMetadataFormModel,
  useAccountFormMetadata,
} from '@/src/features/accounts/hooks/form/useAccountFormMetadata';
import { useAccountFormPickers } from '@/src/features/accounts/hooks/form/useAccountFormPickers';
import {
  useAccount,
  useAccountBalance,
  useAccounts,
} from '@/src/features/accounts/hooks/useAccounts';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import { resolveAccountFormDefaults } from '@/src/features/accounts/services/accountFormService';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { BalanceChangeCounterparty } from '@/src/services/accounts/balanceChangeClassification';
import { useAccountFormHeaderActions } from '@/src/features/accounts/hooks/useAccountFormHeaderActions';
import type { AccountFormChromeState } from '@/src/features/accounts/hooks/useAccountFormHeaderActions';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { useMemo } from 'react';
import { of } from 'rxjs';

export type { AccountMetadataFormModel };

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
  allowedAccountTypes?: readonly AccountType[];
  selectedCurrency: string;
  currencies: Currency[];
  setSelectedCurrency: (value: string) => void;
  selectedIcon: IconName;
  setSelectedIcon: (value: IconName) => void;
  selectedColor: string;
  setSelectedColor: (value: string) => void;
  isAppearancePickerVisible: boolean;
  setIsAppearancePickerVisible: (value: boolean) => void;
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
  formChrome: AccountFormChromeState;
}

/**
 * Account create/edit form composer.
 * Draft is id-keyed (`useAccountFormDraft`); field concerns live in
 * core / metadata / pickers / balanceClassify hooks.
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
    () => (accountId ? accountQueries.observeMetadata(workplaceId, accountId) : of([])),
    [accountId, workplaceId],
    [] as AccountMetadata[],
  );
  const existingMetadata = metadataRecords[0];

  const pathname = usePathname();
  const routeContext = useMemo(
    () => ({
      pathname,
      typeParam,
      previewName: params.pName as string,
      previewType: params.pType as string,
      previewCurrency: params.pCurrency as string,
      previewIcon: params.pIcon as string,
    }),
    [pathname, typeParam, params.pName, params.pType, params.pCurrency, params.pIcon],
  );

  const createFormDefaults = useMemo(
    () => resolveAccountFormDefaults(routeContext, workplaceCurrency),
    [routeContext, workplaceCurrency],
  );

  const { draft, dispatch } = useAccountFormDraft({
    accountId,
    existingAccount,
    balanceData,
    existingMetadata,
    routeContext,
    workplaceCurrency,
    createFormDefaults,
  });

  const core = useAccountFormCore(dispatch, draft.core);
  const pickers = useAccountFormPickers(dispatch, draft.pickers);
  const metadata = useAccountFormMetadata({
    dispatch,
    metadataValues: draft.metadata,
    isPayFromPickerVisible: pickers.isPayFromPickerVisible,
    setIsPayFromPickerVisible: pickers.setIsPayFromPickerVisible,
    accounts,
    localFormError: draft.localFormError,
  });

  const validation = useAccountValidation(core.accountName, accounts, accountId);
  const persistence = useAccountPersistence(
    workplaceId,
    existingAccount,
    accountId,
    accounts.length > 0,
  );

  const { deleteAccount, recoverAccount, mergeAccounts } = useAccountActions(workplaceId);
  const transactionCount = balanceData?.transactionCount ?? 0;
  const isDeleted = Boolean(existingAccount?.deletedAt);

  const formChrome = useAccountFormHeaderActions({
    enabled: isEditMode,
    accountId,
    account: existingAccount ?? null,
    accounts,
    transactionCount,
    isDeleted,
    entityLabel: core.isCategory ? 'Category' : 'Account',
    deleteAccount,
    recoverAction: recoverAccount,
    mergeAccounts,
  });

  const { balanceClassify, onSave } = useAccountFormBalanceClassify({
    dispatch,
    accountId,
    isEditMode,
    core,
    metadataValues: draft.metadata,
    balanceClassifyDraft: draft.balanceClassify,
    existingMetadata,
    balanceData,
    accounts,
    handleSave: persistence.handleSave,
  });

  const hasExistingAccounts = accounts.length > 0;
  const { heroTitle, heroSubtitle, saveLabel } = resolveAccountFormHeroCopy({
    isEditMode,
    accountType: core.accountType,
    hasExistingAccounts,
  });

  const currencyLabel = useMemo(
    () => `Currency${isEditMode ? ' (cannot be changed)' : ''}`,
    [isEditMode],
  );

  const potentialParents = useMemo(
    () =>
      filterPotentialParentAccounts(accounts, {
        accountId,
        accountType: core.accountType,
        selectedCurrency: core.selectedCurrency,
      }),
    [accounts, accountId, core.accountType, core.selectedCurrency],
  );

  const parentAccountName = useMemo(() => {
    if (!core.parentAccountId) return AppConfig.strings.common.none;
    const parent = potentialParents.find(a => a.id === core.parentAccountId);
    return parent ? parent.name : AppConfig.strings.common.none;
  }, [core.parentAccountId, potentialParents]);

  const payFromAccountOptions = useMemo(
    () => filterPayFromAccountOptions(accounts, accountId),
    [accounts, accountId],
  );

  const showCurrency = !core.isCategory;
  const showBalance = !core.isCategory && !isParent;
  const formError = validation.formError || draft.localFormError;

  const allowedAccountTypes = useMemo(
    () => resolveAllowedAccountTypes({ isEditMode, isCategory: core.isCategory }),
    [isEditMode, core.isCategory],
  );

  return {
    heroTitle,
    heroSubtitle,
    isEditMode,
    isCategory: core.isCategory,
    accountName: core.accountName,
    setAccountName: core.setAccountName,
    accountType: core.accountType,
    setAccountType: core.setAccountType,
    accountSubtype: core.accountSubtype,
    setAccountSubtype: core.setAccountSubtype,
    availableSubtypes: core.availableSubtypes,
    allowedAccountTypes,
    selectedCurrency: core.selectedCurrency,
    currencies,
    setSelectedCurrency: core.setSelectedCurrency,
    selectedIcon: core.selectedIcon,
    setSelectedIcon: core.setSelectedIcon,
    selectedColor: core.selectedColor,
    setSelectedColor: core.setSelectedColor,
    isAppearancePickerVisible: pickers.isAppearancePickerVisible,
    setIsAppearancePickerVisible: pickers.setIsAppearancePickerVisible,
    initialBalance: core.initialBalance,
    onInitialBalanceChange: core.onInitialBalanceChange,
    onBack: () => AppNavigation.back(),
    isCreating: persistence.isCreating,
    formError,
    onSave,
    saveLabel,
    currencyLabel,
    showInitialBalance: showBalance,
    isSaveDisabled:
      !core.accountName.trim() ||
      persistence.isCreating ||
      !!validation.formError ||
      !!draft.localFormError,
    parentAccountId: core.parentAccountId,
    parentAccountName,
    setParentAccountId: core.setParentAccountId,
    potentialParents,
    payFromAccountOptions,
    isParentPickerVisible: pickers.isParentPickerVisible,
    setIsParentPickerVisible: pickers.setIsParentPickerVisible,
    isParent,
    showCurrency,
    metadata,
    isLoading: isAccountLoading || isBalanceLoading || isMetadataLoading,
    balanceClassify,
    formChrome,
  };
}
