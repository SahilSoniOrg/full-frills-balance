import Journal from '@/src/data/models/Journal'
import { Model, Relation } from '@nozbe/watermelondb'
import { date, field, readonly, relation } from '@nozbe/watermelondb/decorators'

export enum SmsParseStatus {
  PARSED = 'parsed',
  PARSE_FAILED = 'parse_failed',
  IGNORED = 'ignored',
}

export enum SmsProcessingStatus {
  PENDING = 'pending',
  IMPORTED = 'imported',
  AUTO_POSTED = 'auto_posted',
  DISMISSED = 'dismissed',
  DUPLICATE_FLAGGED = 'duplicate_flagged',
  PARSE_FAILED = 'parse_failed',
}

export enum SmsDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
  UNKNOWN = 'unknown',
}

export default class SmsInboxRecord extends Model {
  static table = 'sms_inbox_records'
  static associations = {
    journals: { type: 'belongs_to', key: 'linked_journal_id' },
  } as const

  @field('device_sms_id') deviceSmsId!: string
  @field('sender_address') senderAddress!: string
  @field('raw_body') rawBody!: string
  @field('sms_date') smsDate!: number
  @field('sms_fingerprint') smsFingerprint!: string
  @field('parse_status') parseStatus!: SmsParseStatus
  @field('parsed_amount') parsedAmount?: number
  @field('parsed_currency_code') parsedCurrencyCode?: string
  @field('parsed_merchant') parsedMerchant?: string
  @field('parsed_account_source') parsedAccountSource?: string
  @field('reference_number') referenceNumber?: string
  @field('direction') direction!: SmsDirection
  @field('processing_status') processingStatus!: SmsProcessingStatus
  @field('linked_journal_id') linkedJournalId?: string
  @field('duplicate_journal_id') duplicateJournalId?: string
  @field('duplicate_confidence') duplicateConfidence?: number
  @field('parse_confidence') parseConfidence?: number
  @field('parse_reason') parseReason?: string
  @field('metadata_json') metadataJson?: string
  @field('first_seen_at') firstSeenAt!: number
  @field('last_scanned_at') lastScannedAt!: number
  @field('processed_at') processedAt?: number

  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date

  @relation('journals', 'linked_journal_id') linkedJournal!: Relation<Journal>
}
