import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { ComponentVariant } from '@/src/utils/style-helpers';

/** Icon keys align with catalog members; services import `Icon` from domainIcons, not UI. */
export type JournalTimelineIconKey =
  typeof Icon.Document | typeof Icon.ArrowUp | typeof Icon.ArrowDown | typeof Icon.SwapHorizontal;

export type JournalTimelineViewer = { accountId: AccountId };

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
