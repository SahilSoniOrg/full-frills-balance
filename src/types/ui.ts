import { TransactionCardProps } from '@/src/components/common/TransactionCard';
import { TransactionId } from './domain';

export type TransactionListItemType = 'transaction' | 'separator';

export interface TransactionListItem {
  id: TransactionId;
  type: TransactionListItemType;
  date: number;
  cardProps?: TransactionCardProps;
  onPress?: () => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  count?: number;
  netAmount?: number;
  currencyCode?: string;
  isReconciledMarker?: boolean;
  reconciledAt?: number | null;
}
