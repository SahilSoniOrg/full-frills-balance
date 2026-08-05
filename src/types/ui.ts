import { JournalEntryCardProps } from '@/src/components/common/JournalEntryCard';
import { JournalId } from './domain';

export type JournalListItemType = 'journal' | 'separator' | 'reconciledMarker';

export type JournalListRowId = JournalId | string;

export interface JournalListItem {
  /** FlashList key. */
  id: JournalListRowId;
  /** Journal identity for selection and share; set on journal entry rows. */
  selectionId?: JournalId;
  type: JournalListItemType;
  date: number;
  cardProps?: JournalEntryCardProps;
  onPress?: () => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  count?: number;
  netAmount?: number;
  currencyCode?: string;
  reconciledAt?: number | null;
}
