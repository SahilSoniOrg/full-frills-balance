import { Icon, isValidIconName, type IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { AccountFields } from '@/src/types/plainDtos';
import { AccountType } from '@/src/types/enums';
import { toAccountType } from '@/src/domain/accounts/accountClassification';

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
      name?: string | null;
      icon?: string | null;
      accountType?: AccountType | string | null;
    };

/**
 * Resolves a catalog IconName for an account — used on write so the DB stores a
 * valid icon, and on read for legacy rows that still lack one.
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
