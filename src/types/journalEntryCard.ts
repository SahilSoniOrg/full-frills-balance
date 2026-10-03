import { IconName } from '@/src/types/domainIcons';
import { ComponentVariant } from '@/src/utils/style-helpers';
import type { JournalTimelineAccountFlow, JournalTimelineLeg } from './journalTimeline';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface JournalEntryBadge {
  id?: string;
  text: string;
  icon?: IconName | null;
  fallbackIcon?: IconName;
  colorKey?: string;
  variant?: ComponentVariant;
}

export interface JournalEntryLeg extends Omit<JournalTimelineLeg, 'icon' | 'fallbackIcon'> {
  icon?: IconName | null;
  fallbackIcon: IconName;
}

export interface JournalEntryAccountFlow extends Omit<
  JournalTimelineAccountFlow,
  'primaryAccount' | 'sources' | 'destinations' | 'neutral'
> {
  primaryAccount?: JournalEntryLeg;
  sources: JournalEntryLeg[];
  destinations: JournalEntryLeg[];
  neutral: JournalEntryLeg[];
}

export interface JournalEntryCardProps {
  title: string;
  amount: number;
  currencyCode: string;
  transactionDate: number | Date;
  /** Grouped timelines already show the date in their day header. */
  dateDisplay?: 'full' | 'time';
  presentation: {
    label: string;
    showTypeBadge: boolean;
    typeIcon: IconName;
    typeColor: string;
    amountPrefix?: string;
  };
  /** Structured flow takes precedence over legacy display-only badges. */
  accountFlow?: JournalEntryAccountFlow;
  badges?: JournalEntryBadge[];
  isSelected?: boolean;
  notes?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  overlay?: ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
}
