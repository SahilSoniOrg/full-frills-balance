import { TransactionBadge } from '@/src/components/common/TransactionCard';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';

export interface TransactionAccountBadgeSource {
  id?: string;
  name: string;
  accountType: AccountType | string;
  icon?: string | null;
  role?: 'SOURCE' | 'DESTINATION' | string;
}

/**
 * Builds account chips for TransactionCard from a list of accounts (journal or ledger context).
 */
export function buildTransactionAccountBadges(
  accounts: TransactionAccountBadgeSource[],
  options?: { withFromToPrefixes?: boolean },
): TransactionBadge[] {
  const withFromToPrefixes = options?.withFromToPrefixes ?? false;

  const badges: TransactionBadge[] = accounts.slice(0, 2).map(acc => {
    let text = acc.name;
    if (withFromToPrefixes) {
      const isSource = acc.role === 'SOURCE';
      const isDest = acc.role === 'DESTINATION';
      const showPrefix = isSource
        ? AppConfig.strings.journal.from
        : isDest
          ? AppConfig.strings.journal.to
          : '';
      text = `${showPrefix}${acc.name}`;
    }

    return {
      id: acc.id,
      text,
      variant: getAccountTypeVariant(acc.accountType),
      icon: acc.icon,
      fallbackIcon: getAccountFallbackIcon(acc.accountType),
    };
  });

  if (accounts.length > 2) {
    badges.push({
      id: 'more',
      text: AppConfig.strings.journal.more(accounts.length - 2),
      variant: 'default',
    });
  }

  return badges;
}
