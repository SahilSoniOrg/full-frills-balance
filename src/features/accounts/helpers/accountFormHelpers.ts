import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import { AccountId, AccountType } from '@/src/types/domain';
import { isCategoryAccountType } from '@/src/utils/accountCategory';

export { isCategoryAccountType };

export const CATEGORY_ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.EXPENSE,
  AccountType.INCOME,
];

export const BALANCE_SHEET_ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.ASSET,
  AccountType.LIABILITY,
  AccountType.EQUITY,
];

export function resolveAllowedAccountTypes(input: {
  isEditMode: boolean;
  isCategory: boolean;
}): readonly AccountType[] | undefined {
  if (input.isEditMode) return undefined;
  return input.isCategory ? CATEGORY_ACCOUNT_TYPES : BALANCE_SHEET_ACCOUNT_TYPES;
}

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
  heroSubtitle: string;
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

  const heroSubtitle = isCategory
    ? ''
    : input.isEditMode
      ? 'Update your account details'
      : input.hasExistingAccounts
        ? 'Add another source of funds'
        : 'Start tracking your finances';

  const saveLabel = input.isEditMode
    ? isCategory
      ? AppConfig.strings.accounts.categoryForm.saveChanges
      : 'Save Changes'
    : isCategory
      ? AppConfig.strings.accounts.categoryForm.createCategory
      : 'Create Account';

  return { heroTitle, heroSubtitle, saveLabel };
}

export function filterPotentialParentAccounts(
  accounts: Account[],
  input: { accountId?: AccountId; accountType: AccountType; selectedCurrency: string },
): Account[] {
  return accounts.filter(
    a =>
      a.id !== input.accountId &&
      a.accountType === input.accountType &&
      a.currencyCode === input.selectedCurrency &&
      !a.parentAccountId,
  );
}

export function filterPayFromAccountOptions(accounts: Account[], accountId?: AccountId): Account[] {
  return accounts.filter(a => a.accountType === AccountType.ASSET && a.id !== accountId);
}
