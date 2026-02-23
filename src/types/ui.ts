import { TransactionCardProps } from '@/src/components/common/TransactionCard';

export type TransactionListItemType = 'transaction' | 'separator';

export interface TransactionListItem {
    id: string;
    type: TransactionListItemType;
    date: number;
    cardProps?: TransactionCardProps;
    onPress?: () => void;
    isCollapsed?: boolean;
    onToggle?: () => void;
    count?: number;
    netAmount?: number;
    currencyCode?: string;
}
