import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import Journal from '@/src/data/models/Journal';
import { JournalId, TransactionChannel } from '@/src/types/domain';
import { Relation } from '@nozbe/watermelondb';
import { date, field, readonly, relation } from '@nozbe/watermelondb/decorators';

export type { TransactionChannel };
export enum InboxParseStatus {
  PARSED = 'parsed',
  PARSE_FAILED = 'parse_failed',
  IGNORED = 'ignored',
}

export enum InboxProcessingStatus {
  PENDING = 'pending',
  IMPORTED = 'imported',
  AUTO_POSTED = 'auto_posted',
  DISMISSED = 'dismissed',
  DUPLICATE_FLAGGED = 'duplicate_flagged',
  PARSE_FAILED = 'parse_failed',
}

export enum TransactionDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
  UNKNOWN = 'unknown',
}

export default class TransactionInboxRecord extends BaseScopedModel {
  static table = 'transaction_inbox_records';
  static associations = {
    journals: { type: 'belongs_to', key: 'linked_journal_id' },
  } as const;

  @field('channel') channel!: TransactionChannel;
  @field('device_source_id') deviceSourceId!: string;
  @field('sender_address') senderAddress?: string;
  @field('raw_body') rawBody?: string;
  @field('input_date') inputDate!: number;
  @field('input_fingerprint') inputFingerprint!: string;
  @field('parse_status') parseStatus!: InboxParseStatus;
  @field('parsed_amount') parsedAmount?: number;
  @field('parsed_currency_code') parsedCurrencyCode?: string;
  @field('parsed_merchant') parsedMerchant?: string;
  @field('parsed_account_source') parsedAccountSource?: string;
  @field('reference_number') referenceNumber?: string;
  @field('direction') direction!: TransactionDirection;
  @field('processing_status') processingStatus!: InboxProcessingStatus;
  @field('linked_journal_id') linkedJournalId?: JournalId;
  @field('duplicate_journal_id') duplicateJournalId?: JournalId;
  @field('duplicate_confidence') duplicateConfidence?: number;
  @field('parse_confidence') parseConfidence?: number;
  @field('parse_reason') parseReason?: string;
  @field('metadata_json') metadataJson?: string;
  @field('first_seen_at') firstSeenAt!: number;
  @field('last_scanned_at') lastScannedAt!: number;
  @field('processed_at') processedAt?: number;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('journals', 'linked_journal_id') linkedJournal!: Relation<Journal>;
}
