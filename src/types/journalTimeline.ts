import { AccountType } from '@/src/data/models/Account';
import { ComponentVariant } from '@/src/utils/style-helpers';

/** Icon keys align with AppIcon names; kept as strings so services avoid UI imports. */
export type JournalTimelineIconKey = 'document' | 'arrowUp' | 'arrowDown' | 'swapHorizontal';

export interface JournalTimelinePresentation {
  label: string;
  typeColorKey: string;
  typeIcon: JournalTimelineIconKey;
  amountPrefix: string;
}

export interface TimelineAccountBadge {
  id?: string;
  text: string;
  variant: ComponentVariant;
  icon?: string | null;
  fallbackIcon?: string;
}

export interface JournalTimelineItem {
  title: string;
  amount: number;
  currencyCode: string;
  transactionDate: number;
  presentation: JournalTimelinePresentation;
  badges: TimelineAccountBadge[];
  notes?: string;
}

export interface ObservableDateRange {
  startDate: number;
  endDate: number;
}

export interface JournalObserveFilter extends ObservableDateRange {
  accountId?: string;
  accountVersion?: number;
  journalIds?: string[];
  plannedPaymentId?: string;
  accountIds?: string[];
}

export interface TransactionAccountBadgeSource {
  id?: string;
  name: string;
  accountType: AccountType | string;
  icon?: string | null;
  role?: 'SOURCE' | 'DESTINATION' | string;
}
