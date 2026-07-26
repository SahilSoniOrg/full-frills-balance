import { TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core/AppIcon';
import {
  mapJournalToTimelineItem,
  mapLedgerTransactionToTimelineItem,
} from '@/src/services/accounting/journalTimelineMapper';
import { DisplayTransaction, EnrichedJournal } from '@/src/types/domain';
import { JournalTimelineItem } from '@/src/types/journalTimeline';

export function mapTimelineItemToCardProps(
  item: JournalTimelineItem,
): Omit<TransactionCardProps, 'onPress'> {
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

export function mapJournalToCardProps(
  journal: EnrichedJournal,
): Omit<TransactionCardProps, 'onPress'> {
  return mapTimelineItemToCardProps(mapJournalToTimelineItem(journal));
}

export function mapLedgerTransactionToCardProps(
  transaction: DisplayTransaction,
): Omit<TransactionCardProps, 'onPress'> {
  return mapTimelineItemToCardProps(mapLedgerTransactionToTimelineItem(transaction));
}
