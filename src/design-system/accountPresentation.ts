import type { ColorKey, Theme } from '@/src/constants/design-tokens';
import { AppConfig } from '@/src/constants/app-config';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountType } from '@/src/types/enums';
import type { ComponentVariant } from '@/src/design-system/variants';
import { getReadableColor, isValidHexColor } from '@/src/design-system/colorMath';
import {
  toAccountType,
  createAccountTypeRecord,
} from '@/src/domain/accounts/accountClassification';

export type AccountTypeColorKey = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'text';

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  AccountType.ASSET,
  AccountType.LIABILITY,
  AccountType.INCOME,
  AccountType.EXPENSE,
  AccountType.EQUITY,
];

export const ACCOUNT_TYPE_SECTION_TITLES: Record<AccountType, string> = {
  [AccountType.ASSET]: AppConfig.strings.accounts.sections.assets,
  [AccountType.LIABILITY]: AppConfig.strings.accounts.sections.liabilities,
  [AccountType.EQUITY]: AppConfig.strings.accounts.sections.equity,
  [AccountType.INCOME]: AppConfig.strings.accounts.sections.income,
  [AccountType.EXPENSE]: AppConfig.strings.accounts.sections.expenses,
};

export const ACCOUNT_TYPE_VARIANTS: Record<AccountType, ComponentVariant> = {
  [AccountType.ASSET]: 'asset',
  [AccountType.LIABILITY]: 'liability',
  [AccountType.EQUITY]: 'equity',
  [AccountType.INCOME]: 'income',
  [AccountType.EXPENSE]: 'expense',
};

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

export function groupAccountsByType(
  accounts: AccountFields[],
): Record<AccountType, AccountFields[]> {
  const groups = createAccountTypeRecord<AccountFields[]>(() => []);

  accounts.forEach(account => {
    const type = toAccountType(account.accountType);
    if (type) groups[type].push(account);
  });

  return groups;
}

export type AccountSection = {
  key: string;
  title: string;
  data: AccountFields[];
  type?: AccountType;
};

export function getAccountSections(accounts: AccountFields[]): AccountSection[] {
  const groups = groupAccountsByType(accounts);
  const sections: AccountSection[] = [];

  ACCOUNT_TYPE_ORDER.forEach(type => {
    if (groups[type].length > 0) {
      const sortedData = [...groups[type]].sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0));
      sections.push({
        key: `type-${type}`,
        title: getAccountTypeSectionTitle(type),
        data: sortedData,
        type,
      });
    }
  });

  // Catch-all: If there are accounts that didn't fit into standard sections
  const classifiedIds = new Set(sections.flatMap(s => s.data.map(a => a.id)));
  const unclassified = accounts.filter(a => !classifiedIds.has(a.id));

  if (unclassified.length > 0) {
    sections.push({
      key: 'fallback-other',
      title: AppConfig.strings.accounts.sections.other,
      data: unclassified,
    });
  }

  return sections;
}

export function getSectionColor(title: string | AccountType, theme: Theme): string {
  return theme[getAccountTypeColorKey(title)];
}

export function getAccountAccentColor(accountType: string | AccountType, theme: Theme): string {
  const key = getAccountTypeColorKey(accountType);
  return theme[key] ?? theme.text;
}

export interface AccountAppearanceColors {
  accentColor: string;
  categoryColor: string;
}

/** Optional text background adjusts only the accent's shade; type color stays unchanged. */
export function resolveAccountAppearance(
  account: { accountType: string | AccountType; color?: string | null },
  theme: Theme,
  textBackground?: string,
): AccountAppearanceColors {
  const categoryColor = getAccountAccentColor(account.accountType, theme);
  const accentColor =
    account.color && isValidHexColor(account.color) ? account.color : categoryColor;
  return {
    accentColor: textBackground ? getReadableColor(accentColor, textBackground) : accentColor,
    categoryColor,
  };
}

/**
 * Resolves the effective accent color for an account: custom per-account color
 * (hex, '' = auto) when set, otherwise derived from the account type.
 */
export function resolveAccountAccentColor(
  account: { accountType: string | AccountType; color?: string | null },
  theme: Theme,
): string {
  return resolveAccountAppearance(account, theme).accentColor;
}
