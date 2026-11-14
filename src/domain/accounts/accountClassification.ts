import { AccountType } from '@/src/types/enums';

const ACCOUNT_TYPE_ALIASES: Record<string, AccountType> = {
  asset: AccountType.ASSET,
  assets: AccountType.ASSET,
  liability: AccountType.LIABILITY,
  liabilities: AccountType.LIABILITY,
  equity: AccountType.EQUITY,
  income: AccountType.INCOME,
  expense: AccountType.EXPENSE,
  expenses: AccountType.EXPENSE,
};

export function toAccountType(input: string | AccountType | null | undefined): AccountType | null {
  if (!input) return null;
  const normalized = String(input).trim().toLowerCase();
  return ACCOUNT_TYPE_ALIASES[normalized] ?? null;
}

export function createAccountTypeRecord<T>(
  initial: T | ((type: AccountType) => T),
): Record<AccountType, T> {
  // Cast required: TypeScript can't narrow `initial` after `typeof === 'function'` when T
  // itself may be a function type. The overloaded union union prevents automatic narrowing.
  const build = (type: AccountType) =>
    typeof initial === 'function' ? (initial as (value: AccountType) => T)(type) : initial;
  return {
    [AccountType.ASSET]: build(AccountType.ASSET),
    [AccountType.LIABILITY]: build(AccountType.LIABILITY),
    [AccountType.EQUITY]: build(AccountType.EQUITY),
    [AccountType.INCOME]: build(AccountType.INCOME),
    [AccountType.EXPENSE]: build(AccountType.EXPENSE),
  };
}

export function isDebitNormalAccountType(typeOrLabel: string | AccountType): boolean {
  const type = toAccountType(typeOrLabel);
  return type === AccountType.ASSET || type === AccountType.EXPENSE;
}

export function isBalanceSheetAccount(typeOrLabel: string | AccountType): boolean {
  const type = toAccountType(typeOrLabel);
  return (
    type === AccountType.ASSET || type === AccountType.LIABILITY || type === AccountType.EQUITY
  );
}

export function isCategoryAccountType(accountType: AccountType): boolean {
  return accountType === AccountType.INCOME || accountType === AccountType.EXPENSE;
}

/** Same split as the Accounts vs Categories tabs: income/expense vs everything else. */
export function countAccountsVsCategories(
  accounts: readonly { readonly accountType: string | AccountType }[],
): { readonly accounts: number; readonly categories: number } {
  let categories = 0;
  for (const account of accounts) {
    const type = toAccountType(account.accountType);
    if (type === AccountType.INCOME || type === AccountType.EXPENSE) categories += 1;
  }
  return { accounts: accounts.length - categories, categories };
}
