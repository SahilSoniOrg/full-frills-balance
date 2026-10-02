import type { AccountId, WorkplaceId, JournalId } from '@/src/types/ids';
import type {
  InboxProcessingStatus,
  InboxParseStatus,
  TransactionDirection,
} from '@/src/types/enums';

export type SmsScanOrigin = 'arrival' | 'catch_up' | 'initial' | 'manual';
export type SmsNotificationState = 'none' | 'pending' | 'delivered' | 'suppressed';
export interface SmsInboxCursor {
  date: number;
  id: string;
}

/** A read projection, never a mutable database model. */
export interface InboxRecordSnapshot {
  id: string;
  workplaceId: WorkplaceId;
  channel: 'sms' | 'voice';
  deviceSourceId: string;
  senderAddress?: string;
  rawBody?: string;
  inputDate: number;
  inputFingerprint: string;
  parseStatus: InboxParseStatus;
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  parsedMerchant?: string;
  parsedAccountSource?: string;
  referenceNumber?: string;
  direction: TransactionDirection;
  processingStatus: InboxProcessingStatus;
  linkedJournalId?: JournalId;
  duplicateJournalId?: JournalId;
  duplicateConfidence?: number;
  parseConfidence?: number;
  parseReason?: string;
  suggestedSourceAccountId?: AccountId;
  suggestedCategoryAccountId?: AccountId;
  metadataJson?: string;
  firstSeenAt: number;
  lastScannedAt: number;
  processedAt?: number;
  deviceInboxId?: string;
  consumedWorkplaces?: { workplaceId: WorkplaceId; name: string }[];
}

export interface TransactionInboxRecordWriteData extends Omit<
  InboxRecordSnapshot,
  'id' | 'channel'
> {
  channel: 'sms';
  contentDigest?: string;
  providerSourceId?: string;
}

export interface SmsWorkplaceReviewState {
  processingStatus: InboxProcessingStatus;
  duplicateJournalId?: InboxRecordSnapshot['duplicateJournalId'];
  duplicateConfidence?: number;
  metadataJson?: string;
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
}
