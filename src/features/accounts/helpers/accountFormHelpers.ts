import { AppConfig } from '@/src/constants/app-config';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { getAccountTreeParentCandidates } from '@/src/services/accounts/accountTree';
import { isCategoryAccountType } from '@/src/utils/accountCategory';

export { isCategoryAccountType };

export function resolveInitialAccountType(input: {
  pathname: string;
  typeParam?: string;
  previewType?: string;
}): AccountType {
  for (const raw of [input.previewType, input.typeParam]) {
    if (!raw) continue;
    const upperType = raw.toUpperCase() as keyof typeof AccountType;
    if (Object.values(AccountType).includes(upperType as AccountType)) {
      return upperType as AccountType;
    }
  }
  if (input.pathname.includes('category-creation')) {
    return AccountType.EXPENSE;
  }
  return AccountType.ASSET;
}

export interface AccountFormHeroCopy {
  heroTitle: string;
  saveLabel: string;
}

export function resolveAccountFormHeroCopy(input: {
  isEditMode: boolean;
  accountType: AccountType;
  hasExistingAccounts: boolean;
}): AccountFormHeroCopy {
  const isCategory = isCategoryAccountType(input.accountType);

  const heroTitle = input.isEditMode
    ? isCategory
      ? AppConfig.strings.accounts.categoryForm.formTitleEdit
      : 'Edit Account'
    : isCategory
      ? AppConfig.strings.accounts.categoryForm.formTitleNew
      : input.hasExistingAccounts
        ? 'Create New Account'
        : 'Create Your First Account';

  const saveLabel = input.isEditMode
    ? isCategory
      ? AppConfig.strings.accounts.categoryForm.saveChanges
      : 'Save Changes'
    : isCategory
      ? AppConfig.strings.accounts.categoryForm.createCategory
      : 'Create Account';

  return { heroTitle, saveLabel };
}

export function filterPotentialParentAccounts(
  accounts: AccountFields[],
  input: {
    accountId?: AccountId;
    accountType: AccountType;
    hasDirectTransactions?: (account: AccountFields) => boolean;
  },
): AccountFields[] {
  return [
    ...getAccountTreeParentCandidates(
      accounts,
      {
        accountId: input.accountId,
        accountType: input.accountType,
      },
      {
        hasDirectTransactions: input.hasDirectTransactions,
      },
    ),
  ];
}

export function filterPayFromAccountOptions(
  accounts: AccountFields[],
  accountId?: AccountId,
): AccountFields[] {
  return accounts.filter(a => a.accountType === AccountType.ASSET && a.id !== accountId);
}
