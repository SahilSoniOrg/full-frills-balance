import { TransactionCardProps } from '@/src/components/common/TransactionCard';
import { TransactionId } from './domain';

export type TransactionListItemType = 'transaction' | 'separator' | 'reconciledMarker';

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
  reconciledAt?: number | null;
}
