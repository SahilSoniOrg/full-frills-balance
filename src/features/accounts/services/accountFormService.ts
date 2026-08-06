import { IconName } from '@/src/components/core';
import Account, { getDefaultSubtypeForType } from '@/src/data/models/Account';
import {
  AccountId,
  AccountSubtype,
  AccountType,
  EMPTY_ACCOUNT_ID,
  SerializedAccountMetadataPayload,
} from '@/src/types/domain';
import {
  isCategoryAccountType,
  resolveInitialAccountType,
} from '@/src/features/accounts/helpers/accountFormHelpers';
import {
  AccountMetadataValues,
  resolveAccountIcon,
  serializeAccountMetadata,
  validateAccountMetadata,
} from '@/src/features/accounts/services/accountMetadataDomain';

export interface AccountFormRouteContext {
  pathname: string;
  typeParam?: string;
  previewName?: string;
  previewType?: string;
  previewCurrency?: string;
  previewIcon?: string;
}

export interface AccountFormDefaults {
  accountName: string;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  selectedCurrency: string;
  selectedIcon: IconName;
  parentAccountId: AccountId;
}

export function resolveAccountFormDefaults(
  route: AccountFormRouteContext,
  workplaceCurrency: string,
  existingAccount?: Account | null,
): AccountFormDefaults {
  const initialType = resolveInitialAccountType({
    pathname: route.pathname,
    typeParam: route.typeParam,
    previewType: route.previewType,
  });

  if (existingAccount) {
    return {
      accountName: existingAccount.name,
      accountType: existingAccount.accountType,
      accountSubtype:
        existingAccount.accountSubtype || getDefaultSubtypeForType(existingAccount.accountType),
      selectedCurrency: existingAccount.currencyCode,
      selectedIcon: resolveAccountIcon(existingAccount.accountType, existingAccount.icon),
      parentAccountId: existingAccount.parentAccountId || EMPTY_ACCOUNT_ID,
    };
  }

  return {
    accountName: route.previewName || '',
    accountType: initialType,
    accountSubtype: getDefaultSubtypeForType(initialType),
    selectedCurrency: route.previewCurrency || workplaceCurrency,
    selectedIcon: resolveAccountIcon(initialType, (route.previewIcon as IconName) || null),
    parentAccountId: EMPTY_ACCOUNT_ID,
  };
}

export function resolveAccountInitialBalance(balanceData?: { balance: number } | null): string {
  if (!balanceData) return '';
  return balanceData.balance.toString();
}

export interface AccountSaveFormInput {
  accountName: string;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  selectedCurrency: string;
  selectedIcon: IconName;
  initialBalance: string;
  parentAccountId: AccountId;
  metadataValues: AccountMetadataValues;
  hasExistingMetadata: boolean;
  balanceData?: { balance: number } | null;
}

export interface AccountSavePayload {
  accountName: string;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  selectedCurrency: string;
  selectedIcon: IconName;
  initialBalance: string;
  balanceData?: { balance: number };
  parentAccountId?: AccountId;
  metadata?: SerializedAccountMetadataPayload;
}

export type BuildAccountSavePayloadResult =
  { ok: true; payload: AccountSavePayload } | { ok: false; error: string };

export function buildAccountSavePayload(
  input: AccountSaveFormInput,
): BuildAccountSavePayloadResult {
  const isCurrentCategory = isCategoryAccountType(input.accountType);

  if (!isCurrentCategory && input.initialBalance && isNaN(Number(input.initialBalance))) {
    return { ok: false, error: 'Initial balance must be a number' };
  }

  const metadataError = validateAccountMetadata(input.metadataValues, input.accountType);
  if (metadataError) {
    return { ok: false, error: metadataError };
  }

  const metadata = serializeAccountMetadata(
    input.metadataValues,
    input.accountType,
    input.hasExistingMetadata,
  );

  return {
    ok: true,
    payload: {
      accountName: input.accountName,
      accountType: input.accountType,
      accountSubtype: input.accountSubtype,
      selectedCurrency: input.selectedCurrency,
      selectedIcon: input.selectedIcon,
      initialBalance: isCurrentCategory ? '' : input.initialBalance,
      balanceData: isCurrentCategory ? undefined : input.balanceData || undefined,
      parentAccountId: input.parentAccountId || undefined,
      metadata,
    },
  };
}
