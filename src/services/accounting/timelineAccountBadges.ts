import { AppConfig } from '@/src/constants';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import { TimelineAccountBadge, TransactionAccountBadgeSource } from '@/src/types/journalTimeline';

export function buildTimelineAccountBadges(
  accounts: TransactionAccountBadgeSource[],
  options?: { withFromToPrefixes?: boolean },
): TimelineAccountBadge[] {
  const withFromToPrefixes = options?.withFromToPrefixes ?? false;

  const badges: TimelineAccountBadge[] = accounts.slice(0, 2).map(acc => {
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
