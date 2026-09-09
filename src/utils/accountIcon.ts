import { Icon, isValidIconName, type IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { AccountFields } from '@/src/types/plainDtos';
import { AccountType } from '@/src/types/enums';
import { toAccountType } from '@/src/utils/accountCategory';

/**
 * Resolves default fallback icon based on account type.
 * Categories (EXPENSE -> tag, INCOME -> trendingUp) get category icons,
 * whereas financial accounts (ASSET, LIABILITY, EQUITY) get wallet.
 */
export function getAccountFallbackIcon(accountType?: AccountType | string | null): IconName {
  if (!accountType) return Icon.Wallet;
  const type = toAccountType(accountType);
  if (type === AccountType.EXPENSE) return Icon.Tag;
  if (type === AccountType.INCOME) return Icon.TrendingUp;
  return Icon.Wallet;
}

export type AccountLikeForIcon =
  | AccountFields
  | {
      name?: string;
      icon?: string | null;
      accountType?: AccountType | string | null;
    };

/**
 * Reliable way to get an icon for an account,
 * handling special cases for system accounts (OBE, Balance Corrections)
 * and falling back to type-appropriate default icons when missing or unknown in DB.
 */
export function getAccountIcon(account: AccountLikeForIcon): IconName {
  if (isValidIconName(account.icon)) return account.icon;

  const name = account.name || '';
  if (name) {
    const { openingBalances, balanceCorrections } = AppConfig.systemAccounts;
    const lowerName = name.toLowerCase();

    if (lowerName.includes(openingBalances.namePrefix.toLowerCase())) {
      return openingBalances.icon;
    }

    if (lowerName.includes(balanceCorrections.namePrefix.toLowerCase())) {
      return balanceCorrections.icon;
    }
  }

  return getAccountFallbackIcon(account.accountType);
}
