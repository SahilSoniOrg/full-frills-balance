import { JournalEntryCardProps } from '@/src/components/journal/JournalEntryCard';
import { Icon, isValidIconName, parseIconName } from '@/src/types/domainIcons';
import { mapJournalToTimelineItem } from '@/src/services/journal/journalTimelinePresentation';
import { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalTimelineItem, JournalTimelineViewer } from '@/src/types/journalTimeline';

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
      typeColor: item.presentation.typeColorKey,
      typeIcon: item.presentation.typeIcon,
      amountPrefix: item.presentation.amountPrefix,
    },
    badges: item.badges.map(badge => ({
      ...badge,
      icon: isValidIconName(badge.icon) ? badge.icon : undefined,
      fallbackIcon: badge.fallbackIcon ? parseIconName(badge.fallbackIcon, Icon.Wallet) : undefined,
    })),
    notes: item.notes,
  };
}

export function mapJournalToEntryCardProps(
  journal: EnrichedJournal,
  viewer?: JournalTimelineViewer,
): Omit<JournalEntryCardProps, 'onPress'> {
  return mapTimelineItemToEntryCardProps(mapJournalToTimelineItem(journal, viewer));
}

export function mapTimelineRowToEntryCardProps(
  row: JournalTimelineRow,
): Omit<JournalEntryCardProps, 'onPress'> {
  return mapJournalToEntryCardProps(row.journal, row.viewer);
}
