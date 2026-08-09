import { JournalEntryCardProps } from '@/src/components/common/JournalEntryCard';
import { IconName } from '@/src/components/core/AppIcon';
import { mapJournalToTimelineItem } from '@/src/services/journal/journalTimelinePresentation';
import { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import { EnrichedJournal } from '@/src/types/domain';
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
      typeIcon: item.presentation.typeIcon as IconName,
      amountPrefix: item.presentation.amountPrefix,
    },
    badges: item.badges,
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
