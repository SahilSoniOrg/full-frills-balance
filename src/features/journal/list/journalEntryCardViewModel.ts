import { JournalEntryCardProps, JournalEntryLeg } from '@/src/types/journalEntryCard';
import { Icon, isValidIconName, parseIconName } from '@/src/types/domainIcons';
import { JournalTimelineItem, JournalTimelineLeg } from '@/src/types/journalTimeline';

function mapLeg(leg: JournalTimelineLeg): JournalEntryLeg {
  return {
    ...leg,
    icon: isValidIconName(leg.icon) ? leg.icon : undefined,
    fallbackIcon: parseIconName(leg.fallbackIcon, Icon.Wallet),
  };
}

export function mapTimelineItemToEntryCardProps(
  item: JournalTimelineItem,
): Omit<JournalEntryCardProps, 'onPress'> {
  return {
    title: item.title,
    amount: item.amount,
    currencyCode: item.currencyCode,
    transactionDate: item.transactionDate,
    presentation: {
      label: item.presentation.label,
      showTypeBadge: item.presentation.showTypeBadge,
      typeColor: item.presentation.typeColorKey,
      typeIcon: item.presentation.typeIcon,
      amountPrefix: item.presentation.amountPrefix,
    },
    accountFlow: {
      ...item.accountFlow,
      primaryAccount: item.accountFlow.primaryAccount
        ? mapLeg(item.accountFlow.primaryAccount)
        : undefined,
      sources: item.accountFlow.sources.map(mapLeg),
      destinations: item.accountFlow.destinations.map(mapLeg),
      neutral: item.accountFlow.neutral.map(mapLeg),
    },
    notes: item.notes,
  };
}
