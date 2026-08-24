import { IconName } from '@/src/components/core';
import type { AccountFields, PlainAccountMetadata } from '@/src/types/plainDtos';
import { getDefaultSubtypeForType } from '@/src/types/accountSubtype';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { isCategoryAccountType } from '@/src/features/accounts/helpers/accountFormHelpers';
import {
  AccountFormDefaults,
  AccountFormRouteContext,
  resolveAccountFormDefaults,
  resolveAccountInitialBalance,
} from '@/src/features/accounts/services/accountFormService';
import {
  AccountMetadataValues,
  createDefaultAccountMetadataValues,
} from '@/src/features/accounts/services/accountMetadataDomain';

/** Core editable fields on the account create/edit form. */
export interface AccountFormCoreDraft {
  accountName: string;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  selectedCurrency: string;
  selectedIcon: IconName;
  /** Custom accent hex ('' = auto, derived from account type). */
  selectedColor: string;
  initialBalance: string;
  parentAccountId: AccountId;
}

export interface AccountFormPickersDraft {
  isAppearancePickerVisible: boolean;
  isParentPickerVisible: boolean;
  isPayFromPickerVisible: boolean;
}

export interface AccountFormBalanceClassifyDraft {
  visible: boolean;
  discrepancy: number;
}

/**
 * Local form draft. Seeded once per `accountId` from observe (and once for
 * balance / metadata when those records first arrive). Later observe ticks
 * must NOT overwrite dirty fields (charting lock).
 */
export interface AccountFormDraftState {
  /** Entity id last seeded into core; `null` means create-mode defaults. */
  seededAccountId: AccountId | null;
  /** AccountFields id whose balance was injected; `null` = not yet. */
  seededBalanceAccountId: AccountId | null;
  /** AccountFields id whose metadata was injected; `null` = not yet. */
  seededMetadataAccountId: AccountId | null;
  core: AccountFormCoreDraft;
  metadata: AccountMetadataValues;
  pickers: AccountFormPickersDraft;
  balanceClassify: AccountFormBalanceClassifyDraft;
  localFormError: string | null;
}

export type AccountFormDraftAction =
  | { type: 'SEED_CREATE'; core: AccountFormCoreDraft }
  | { type: 'SEED_EDIT_CORE'; accountId: AccountId; core: AccountFormCoreDraft }
  | { type: 'SEED_BALANCE'; accountId: AccountId; initialBalance: string }
  | { type: 'SEED_METADATA'; accountId: AccountId; metadata: AccountMetadataValues }
  | { type: 'PATCH_CORE'; patch: Partial<AccountFormCoreDraft> }
  | { type: 'SET_ACCOUNT_TYPE'; accountType: AccountType }
  | {
      type: 'PATCH_METADATA';
      key: keyof AccountMetadataValues;
      value: AccountMetadataValues[keyof AccountMetadataValues];
    }
  | { type: 'SET_PICKER'; picker: keyof AccountFormPickersDraft; visible: boolean }
  | { type: 'SHOW_BALANCE_CLASSIFY'; discrepancy: number }
  | { type: 'HIDE_BALANCE_CLASSIFY' }
  | { type: 'SET_LOCAL_ERROR'; error: string | null };

const EMPTY_PICKERS: AccountFormPickersDraft = {
  isAppearancePickerVisible: false,
  isParentPickerVisible: false,
  isPayFromPickerVisible: false,
};

const EMPTY_BALANCE_CLASSIFY: AccountFormBalanceClassifyDraft = {
  visible: false,
  discrepancy: 0,
};

export function coreFromDefaults(defaults: AccountFormDefaults): AccountFormCoreDraft {
  return {
    accountName: defaults.accountName,
    accountType: defaults.accountType,
    accountSubtype: defaults.accountSubtype,
    selectedCurrency: defaults.selectedCurrency,
    selectedIcon: defaults.selectedIcon,
    selectedColor: defaults.selectedColor,
    initialBalance: '',
    parentAccountId: defaults.parentAccountId,
  };
}

export function createAccountFormDraft(defaults: AccountFormDefaults): AccountFormDraftState {
  return {
    seededAccountId: null,
    seededBalanceAccountId: null,
    seededMetadataAccountId: null,
    core: coreFromDefaults(defaults),
    metadata: createDefaultAccountMetadataValues(null),
    pickers: EMPTY_PICKERS,
    balanceClassify: EMPTY_BALANCE_CLASSIFY,
    localFormError: null,
  };
}

export function mapAccountToCoreDraft(
  account: AccountFields,
  route: AccountFormRouteContext,
  workplaceCurrency: string,
): AccountFormCoreDraft {
  const defaults = resolveAccountFormDefaults(route, workplaceCurrency, account);
  return coreFromDefaults(defaults);
}

export function mapBalanceToDraftBalance(balanceData?: { balance: number } | null): string {
  return resolveAccountInitialBalance(balanceData);
}

export function mapMetadataToDraft(metadata?: PlainAccountMetadata | null): AccountMetadataValues {
  return createDefaultAccountMetadataValues(metadata ?? null);
}

/**
 * Seed once per accountId when the observed account first arrives.
 * Later observe ticks must NOT re-seed (preserves dirty draft).
 */
export function shouldSeedAccountCoreDraft(args: {
  accountId: AccountId | undefined;
  seededAccountId: AccountId | null;
  existingAccount: AccountFields | null | undefined;
}): boolean {
  const { accountId, seededAccountId, existingAccount } = args;
  if (!accountId || !existingAccount) return false;
  if (existingAccount.id !== accountId) return false;
  return seededAccountId !== accountId;
}

/**
 * Seed balance once per accountId when balance observe first arrives.
 */
export function shouldSeedAccountBalanceDraft(args: {
  accountId: AccountId | undefined;
  seededBalanceAccountId: AccountId | null;
  balanceData: { balance: number } | null | undefined;
}): boolean {
  const { accountId, seededBalanceAccountId, balanceData } = args;
  if (!accountId || !balanceData) return false;
  return seededBalanceAccountId !== accountId;
}

/**
 * Seed metadata once per accountId when metadata observe first arrives.
 */
export function shouldSeedAccountMetadataDraft(args: {
  accountId: AccountId | undefined;
  seededMetadataAccountId: AccountId | null;
  existingMetadata: PlainAccountMetadata | undefined;
}): boolean {
  const { accountId, seededMetadataAccountId, existingMetadata } = args;
  if (!accountId || !existingMetadata) return false;
  return seededMetadataAccountId !== accountId;
}

export function accountFormDraftReducer(
  state: AccountFormDraftState,
  action: AccountFormDraftAction,
): AccountFormDraftState {
  switch (action.type) {
    case 'SEED_CREATE':
      // Leaving edit → create: full reset so seed keys do not leak.
      return {
        ...createAccountFormDraft({
          accountName: action.core.accountName,
          accountType: action.core.accountType,
          accountSubtype: action.core.accountSubtype,
          selectedCurrency: action.core.selectedCurrency,
          selectedIcon: action.core.selectedIcon,
          selectedColor: action.core.selectedColor,
          parentAccountId: action.core.parentAccountId,
        }),
        core: action.core,
      };
    case 'SEED_EDIT_CORE': {
      if (state.seededAccountId === action.accountId) return state;
      const balanceAlreadyForId = state.seededBalanceAccountId === action.accountId;
      const metadataAlreadyForId = state.seededMetadataAccountId === action.accountId;
      return {
        ...state,
        seededAccountId: action.accountId,
        seededBalanceAccountId: balanceAlreadyForId ? action.accountId : null,
        seededMetadataAccountId: metadataAlreadyForId ? action.accountId : null,
        core: {
          ...action.core,
          initialBalance: balanceAlreadyForId
            ? state.core.initialBalance
            : action.core.initialBalance,
        },
        metadata: metadataAlreadyForId ? state.metadata : createDefaultAccountMetadataValues(null),
        localFormError: null,
        balanceClassify: EMPTY_BALANCE_CLASSIFY,
        pickers: EMPTY_PICKERS,
      };
    }
    case 'SEED_BALANCE': {
      if (state.seededBalanceAccountId === action.accountId) return state;
      return {
        ...state,
        seededBalanceAccountId: action.accountId,
        core: { ...state.core, initialBalance: action.initialBalance },
      };
    }
    case 'SEED_METADATA': {
      if (state.seededMetadataAccountId === action.accountId) return state;
      return {
        ...state,
        seededMetadataAccountId: action.accountId,
        metadata: action.metadata,
      };
    }
    case 'PATCH_CORE': {
      const clearError = action.patch.initialBalance !== undefined && state.localFormError;
      return {
        ...state,
        core: { ...state.core, ...action.patch },
        localFormError: clearError ? null : state.localFormError,
      };
    }
    case 'SET_ACCOUNT_TYPE': {
      const isTargetCategory = isCategoryAccountType(action.accountType);
      return {
        ...state,
        core: {
          ...state.core,
          accountType: action.accountType,
          accountSubtype: getDefaultSubtypeForType(action.accountType),
          parentAccountId: EMPTY_ACCOUNT_ID,
          initialBalance: isTargetCategory ? '' : state.core.initialBalance,
        },
      };
    }
    case 'PATCH_METADATA':
      return {
        ...state,
        metadata: { ...state.metadata, [action.key]: action.value },
      };
    case 'SET_PICKER':
      return {
        ...state,
        pickers: { ...state.pickers, [action.picker]: action.visible },
      };
    case 'SHOW_BALANCE_CLASSIFY':
      return {
        ...state,
        balanceClassify: { visible: true, discrepancy: action.discrepancy },
      };
    case 'HIDE_BALANCE_CLASSIFY':
      return {
        ...state,
        balanceClassify: EMPTY_BALANCE_CLASSIFY,
      };
    case 'SET_LOCAL_ERROR':
      return { ...state, localFormError: action.error };
    default:
      return state;
  }
}
