import { IconName } from '@/src/types/domainIcons';
import { AccountId } from '@/src/types/ids';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** One posting line; identity is distinct from the account it references. */
export interface JournalEntryLeg {
  id: string;
  accountId: AccountId;
  name: string;
  role: 'SOURCE' | 'DESTINATION' | 'NEUTRAL';
  icon?: IconName | null;
  color?: string;
  fallbackIcon: IconName;
  variant: ComponentVariant;
}

export interface JournalEntryAccountFlow {
  primaryAccount?: JournalEntryLeg;
  sources: JournalEntryLeg[];
  destinations: JournalEntryLeg[];
  neutral: JournalEntryLeg[];
  /** Disambiguate the main amount when legs use different currencies. */
  showCurrencyCodes: boolean;
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
  accountFlow: JournalEntryAccountFlow;
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
  notes?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  overlay?: ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
}
