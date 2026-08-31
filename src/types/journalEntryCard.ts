import { IconName } from '@/src/types/domainIcons';
import { ComponentVariant } from '@/src/utils/style-helpers';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface JournalEntryBadge {
  id?: string;
  text: string;
  icon?: IconName | string | null;
  fallbackIcon?: IconName;
  colorKey?: string;
  variant?: ComponentVariant;
}

export interface JournalEntryCardProps {
  title: string;
  amount: number;
  currencyCode: string;
  transactionDate: number | Date;
  presentation: {
    label: string;
    typeIcon: IconName;
    typeColor: string;
    amountPrefix?: string;
  };
  badges: JournalEntryBadge[];
  notes?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  overlay?: ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
  contentScale?: number;
}
