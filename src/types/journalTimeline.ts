import { Icon } from '@/src/types/domainIcons';
import { AccountId, TransactionId } from '@/src/types/ids';

/** Icon keys align with catalog members; services import `Icon` from domainIcons, not UI. */
export type JournalTimelineIconKey =
  typeof Icon.Document | typeof Icon.ArrowUp | typeof Icon.ArrowDown | typeof Icon.SwapHorizontal;

export type JournalTimelineViewer = { accountId: AccountId; transactionId?: TransactionId };
