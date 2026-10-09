import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountId } from '@/src/types/ids';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import {
  type AccountFields,
  type PlainAccountMetadata,
  type PlainCurrency,
} from '@/src/types/plainDtos';
import {
  filterPayFromAccountOptions,
  filterPotentialParentAccounts,
  resolveAccountFormHeroCopy,
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
  useAccountBalances,
  useAccounts,
} from '@/src/hooks/useAccounts';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { useAccountPersistence } from '@/src/features/accounts/hooks/useAccountPersistence';
import { useAccountValidation } from '@/src/features/accounts/hooks/useAccountValidation';
import { resolveAccountFormDefaults } from '@/src/features/accounts/services/accountFormService';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { BalanceChangeCounterparty } from '@/src/services/accounts/balanceChangeClassification';
import { useAccountArchiveAction } from '@/src/features/accounts/hooks/useAccountArchiveAction';
import { useAccountDeleteMergeActions } from '@/src/features/accounts/hooks/useAccountDeleteMergeActions';
import type { AccountMergePickerModalProps } from '@/src/features/accounts/hooks/useAccountDeleteMergeActions';
import type { AccountArchiveCascadeModalProps } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import type { AccountManagementAction } from '@/src/features/accounts/helpers/accountManagementActions';
import { createAccountTreeSnapshot } from '@/src/services/accounts/accountTree';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { Keyboard } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import {
  useAccountFormKind,
  type AccountFormKindApi,
} from '@/src/features/accounts/hooks/form/useAccountFormKind';
import { of } from 'rxjs';

export type AccountFormChromeState = {
  managementActions: AccountManagementAction[];
  archiveCascadeModal: AccountArchiveCascadeModalProps | null;
  mergePickerModal: AccountMergePickerModalProps | null;
};

export interface AccountFormViewModel extends AccountFormKindApi {
  activeSheet: 'kinds' | 'currency' | 'currency-info' | 'note' | null;
  setActiveSheet: (sheet: AccountFormViewModel['activeSheet']) => void;
  currencyPrecision: number;
  heroTitle: string;
  isEditMode: boolean;
  isCategory: boolean;
  accountName: string;
  setAccountName: (value: string) => void;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  selectedCurrency: string;
  currencies: PlainCurrency[];
  setSelectedCurrency: (value: string) => void;
  selectedIcon: IconName;
  setSelectedIcon: (value: IconName) => void;
  selectedColor: string;
  setSelectedColor: (value: string) => void;
  isAppearancePickerVisible: boolean;
  setIsAppearancePickerVisible: (value: boolean) => void;
  initialBalance: string;
  onInitialBalanceChange: (value: string) => void;
  isCreating: boolean;
  leaveAfterSave: (() => void) | null;
  formError: string | null;
  onSave: () => void;
  showInitialBalance: boolean;
  isSaveDisabled: boolean;
  parentAccountId: AccountId;
  parentAccountName: string;
  setParentAccountId: (value: AccountId) => void;
  potentialParents: AccountFields[];
  payFromAccountOptions: AccountFields[];
  isParentPickerVisible: boolean;
  setIsParentPickerVisible: (visible: boolean) => void;
  isParent: boolean;
  metadata: AccountMetadataFormModel;
  isLoading: boolean;
  balanceClassify: {
    visible: boolean;
    accounts: AccountFields[];
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

export function useAccountFormViewModel(): AccountFormViewModel {
  const params = useLocalSearchParams<{
    accountId: AccountId;
    type: string;
    subtype: string;
    pName: string;
    pType: string;
    pCurrency: string;
    pIcon: string;
    returnTarget: string;
  }>();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const accountId = params.accountId;
  const typeParam = params.type;
  const subtypeParam = params.subtype;
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
  const { balancesByAccountId } = useAccountBalances(workplaceId, accounts, workplaceCurrency);

  const { data: isParent } = useObservable(
    () => (accountId ? accountQueries.observeHasChildren(workplaceId, accountId) : of(false)),
    [accountId, workplaceId],
    false,
  );

  const { currencies } = useCurrencies();
  const { data: metadataRecords, isLoading: isMetadataLoading } = useObservable(
    () => (accountId ? accountQueries.observeMetadata(workplaceId, accountId) : of([])),
    [accountId, workplaceId],
    [] as PlainAccountMetadata[],
  );
  const existingMetadata = metadataRecords[0];

  const pathname = usePathname();
  const routeContext = useMemo(
    () => ({
      pathname,
      typeParam,
      subtypeParam,
      previewName: params.pName as string,
      previewType: params.pType as string,
      previewCurrency: params.pCurrency as string,
      previewIcon: params.pIcon as string,
    }),
    [pathname, typeParam, subtypeParam, params.pName, params.pType, params.pCurrency, params.pIcon],
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

  const [activeSheet, updateActiveSheet] = useState<AccountFormViewModel['activeSheet']>(null);
  const setActiveSheet = useCallback((sheet: AccountFormViewModel['activeSheet']) => {
    Keyboard.dismiss();
    updateActiveSheet(sheet);
  }, []);
  const core = useAccountFormCore(dispatch, draft.core);
  const kind = useAccountFormKind({
    core: draft.core,
    dispatch,
    isEditMode,
    hasSubtypeRouteParam: subtypeParam !== undefined,
    canChangeKind: !isParent,
  });
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
    params.returnTarget,
  );

  const { deleteAccount, recoverAccount, mergeAccounts, disbandGroup } =
    useAccountActions(workplaceId);
  const [leaveAfterRemoval, setLeaveAfterRemoval] = useState<(() => void) | null>(null);
  const accountTree = useMemo(() => createAccountTreeSnapshot(accounts), [accounts]);
  const directTransactionCount = balanceData?.directTransactionCount ?? 0;
  const isDeleted = Boolean(existingAccount?.deletedAt);

  const archive = useAccountArchiveAction({
    enabled: isEditMode,
    accountId,
    account: existingAccount ?? null,
    accounts,
  });
  const deleteMerge = useAccountDeleteMergeActions({
    accountId,
    account: existingAccount ?? null,
    accounts,
    tree: accountTree,
    directTransactionCount,
    isDeleted,
    enabled: isEditMode,
    entityLabel: core.isCategory ? 'Category' : 'Account',
    deleteAccount,
    recoverAction: recoverAccount,
    mergeAccounts,
    disbandGroup,
    onRemoved: leave => setLeaveAfterRemoval(() => leave),
  });
  const formChrome = useMemo(
    (): AccountFormChromeState => ({
      managementActions: [...archive.actions, ...deleteMerge.actions],
      archiveCascadeModal: archive.archiveCascadeModal,
      mergePickerModal: deleteMerge.mergePickerModal,
    }),
    [
      archive.archiveCascadeModal,
      archive.actions,
      deleteMerge.actions,
      deleteMerge.mergePickerModal,
    ],
  );

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
  const { heroTitle, saveLabel } = resolveAccountFormHeroCopy({
    isEditMode,
    accountType: core.accountType,
    hasExistingAccounts,
  });

  const potentialParents = useMemo(
    () =>
      filterPotentialParentAccounts(accounts, {
        accountId,
        accountType: core.accountType,
        hasDirectTransactions: account => {
          const balance = balancesByAccountId.get(account.id);
          return balance == null || (balance.directTransactionCount || 0) > 0;
        },
      }),
    [accounts, accountId, balancesByAccountId, core.accountType],
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

  // creation for both accounts and categories. Existing entities remain locked.
  const showBalance = !core.isCategory && !isParent;
  const formError = validation.formError || draft.localFormError;

  return {
    ...kind,
    activeSheet,
    setActiveSheet,
    currencyPrecision:
      currencies.find(currency => currency.code === core.selectedCurrency)?.precision ?? 2,
    submitLabel: core.isCategory ? saveLabel : kind.submitLabel,
    heroTitle:
      !core.isCategory && !isEditMode && kind.kindLabel
        ? copy.newKind(kind.kindLabel.toLowerCase())
        : heroTitle,
    isEditMode,
    isCategory: core.isCategory,
    accountName: core.accountName,
    setAccountName: core.setAccountName,
    accountType: core.accountType,
    accountSubtype: core.accountSubtype,
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
    isCreating: persistence.isCreating,
    leaveAfterSave: leaveAfterRemoval ?? persistence.leaveAfterSave,
    formError,
    onSave,
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
    metadata,
    isLoading: isAccountLoading || isBalanceLoading || isMetadataLoading,
    balanceClassify,
    formChrome,
  };
}
