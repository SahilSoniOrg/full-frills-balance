import { IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { PlainAccount } from '@/src/types/domain';
import { toAccountType } from '@/src/utils/accountCategory';

/**
 * Resolves default fallback icon based on account type.
 * Categories (EXPENSE -> tag, INCOME -> trendingUp) get category icons,
 * whereas financial accounts (ASSET, LIABILITY, EQUITY) get wallet.
 */
export function getAccountFallbackIcon(accountType?: AccountType | string | null): IconName {
  if (!accountType) return 'wallet';
  const type = toAccountType(accountType);
  if (type === AccountType.EXPENSE) return 'tag';
  if (type === AccountType.INCOME) return 'trendingUp';
  return 'wallet';
}

export type AccountLikeForIcon =
  | Account
  | PlainAccount
  | {
      name?: string;
      icon?: IconName | string | null;
      accountType?: AccountType | string | null;
    };

/**
 * Reliable way to get an icon for an account,
 * handling special cases for system accounts (OBE, Balance Corrections)
 * and falling back to type-appropriate default icons when missing in DB.
 */
export function getAccountIcon(account: AccountLikeForIcon): IconName {
  if (account.icon) return account.icon as IconName;

  const name = account.name || '';
  if (name) {
    const { openingBalances, balanceCorrections } = AppConfig.systemAccounts;
    const lowerName = name.toLowerCase();

    // Opening Balances (OBE)
    if (lowerName.includes(openingBalances.namePrefix.toLowerCase())) {
      return openingBalances.icon as IconName;
    }

    // Balance Corrections
    if (lowerName.includes(balanceCorrections.namePrefix.toLowerCase())) {
      return balanceCorrections.icon as IconName;
    }
  }

  return getAccountFallbackIcon(account.accountType);
}
