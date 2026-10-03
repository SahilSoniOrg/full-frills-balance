import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import { AccountId, TransactionId } from '@/src/types/ids';
import { ComponentVariant } from '@/src/utils/style-helpers';

/** Icon keys align with catalog members; services import `Icon` from domainIcons, not UI. */
export type JournalTimelineIconKey =
  typeof Icon.Document | typeof Icon.ArrowUp | typeof Icon.ArrowDown | typeof Icon.SwapHorizontal;

export type JournalTimelineViewer = { accountId: AccountId; transactionId?: TransactionId };

/** One posting line; identity is distinct from the account it references. */
export interface JournalTimelineLeg {
  id: string;
  accountId: AccountId;
  name: string;
  role: 'SOURCE' | 'DESTINATION' | 'NEUTRAL';
  amount?: number;
  currencyCode?: string;
  icon?: string | null;
  color?: string;
  fallbackIcon: string;
  variant: ComponentVariant;
}

export interface JournalTimelineAccountFlow {
  primaryAccount?: JournalTimelineLeg;
  sources: JournalTimelineLeg[];
  destinations: JournalTimelineLeg[];
  neutral: JournalTimelineLeg[];
  /** Disambiguate the main amount when legs use different currencies. */
  showCurrencyCodes: boolean;
}

export interface JournalTimelinePresentation {
  label: string;
  /** Routine income/expense/transfer types are already conveyed by the amount sign and icon. */
  showTypeBadge: boolean;
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
  accountFlow?: JournalTimelineAccountFlow;
  notes?: string;
}

export interface TransactionAccountBadgeSource {
  id?: string;
  name: string;
  accountType: AccountType | string;
  icon?: string | null;
  role?: 'SOURCE' | 'DESTINATION' | string;
}
