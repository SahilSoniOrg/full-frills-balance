import { ColorKey, Theme } from '@/src/constants/design-tokens';
import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { TabType } from '@/src/types/domain';
import { ComponentVariant } from '@/src/utils/style-helpers';

export type AccountTypeColorKey = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'text';

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  AccountType.ASSET,
  AccountType.LIABILITY,
  AccountType.INCOME,
  AccountType.EXPENSE,
  AccountType.EQUITY,
];

export const ACCOUNT_TYPE_SECTION_TITLES: Record<AccountType, string> = {
  [AccountType.ASSET]: 'Assets',
  [AccountType.LIABILITY]: 'Liabilities',
  [AccountType.EQUITY]: 'Equity',
  [AccountType.INCOME]: 'Income',
  [AccountType.EXPENSE]: 'Expenses',
};

export const ACCOUNT_TYPE_VARIANTS: Record<AccountType, ComponentVariant> = {
  [AccountType.ASSET]: 'asset',
  [AccountType.LIABILITY]: 'liability',
  [AccountType.EQUITY]: 'equity',
  [AccountType.INCOME]: 'income',
  [AccountType.EXPENSE]: 'expense',
};

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

const ACCOUNT_TYPE_CACHE = new Map<string, AccountType | null>();

export function toAccountType(input: string | AccountType | null | undefined): AccountType | null {
  if (!input) return null;
  const key = String(input);
  if (ACCOUNT_TYPE_CACHE.has(key)) return ACCOUNT_TYPE_CACHE.get(key)!;

  const normalized = key.trim().toLowerCase();
  const result = ACCOUNT_TYPE_ALIASES[normalized] || null;
  ACCOUNT_TYPE_CACHE.set(key, result);
  return result;
}

export function getAccountTypeSectionTitle(type: AccountType): string {
  return ACCOUNT_TYPE_SECTION_TITLES[type];
}

export function getAccountTypeVariant(typeOrLabel: string | AccountType): ComponentVariant {
  const type = toAccountType(typeOrLabel);
  return type ? ACCOUNT_TYPE_VARIANTS[type] : 'text';
}

export function getAccountTypeColorKey(typeOrLabel: string | AccountType): ColorKey {
  const type = toAccountType(typeOrLabel);
  if (!type) return 'text';
  return ACCOUNT_TYPE_VARIANTS[type] as ColorKey;
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

export function isAssetOrLiability(typeOrLabel: string | AccountType): boolean {
  const type = toAccountType(typeOrLabel);
  return type === AccountType.ASSET || type === AccountType.LIABILITY;
}

export function getInferredAccountType(tab: TabType, side: TransactionType): AccountType {
  if (tab === 'expense') {
    return side === TransactionType.DEBIT ? AccountType.EXPENSE : AccountType.ASSET;
  }
  if (tab === 'income') {
    return side === TransactionType.CREDIT ? AccountType.INCOME : AccountType.ASSET;
  }
  // For transfers, both sides are Assets (or Liabilities)
  return AccountType.ASSET;
}

export function getAllowedAccountTypes(tab: TabType, side: TransactionType): AccountType[] {
  if (tab === 'expense') {
    return side === TransactionType.DEBIT
      ? [AccountType.EXPENSE]
      : [AccountType.ASSET, AccountType.LIABILITY];
  }
  if (tab === 'income') {
    return side === TransactionType.CREDIT
      ? [AccountType.INCOME]
      : [AccountType.ASSET, AccountType.LIABILITY];
  }
  // Transfer
  return [AccountType.ASSET, AccountType.LIABILITY];
}

export function groupAccountsByType(accounts: Account[]): Record<AccountType, Account[]> {
  const groups = createAccountTypeRecord<Account[]>(() => []);

  accounts.forEach(account => {
    const type = toAccountType(account.accountType);
    if (type) groups[type].push(account);
  });

  return groups;
}

export function getAccountSections(accounts: Account[]): { title: string; data: Account[] }[] {
  const groups = groupAccountsByType(accounts);
  const sections: { title: string; data: Account[] }[] = [];

  ACCOUNT_TYPE_ORDER.forEach(type => {
    if (groups[type].length > 0) {
      const sortedData = [...groups[type]].sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0));
      sections.push({ title: getAccountTypeSectionTitle(type), data: sortedData });
    }
  });

  return sections;
}

export function getAccountVariant(typeOrTitle: string | AccountType): ComponentVariant {
  return getAccountTypeVariant(typeOrTitle);
}

export function getSectionColor(title: string | AccountType, theme: Theme): string {
  return theme[getAccountTypeColorKey(title)];
}

export function getAccountAccentColor(accountType: string | AccountType, theme: Theme): string {
  return theme[getAccountTypeColorKey(accountType)];
}
