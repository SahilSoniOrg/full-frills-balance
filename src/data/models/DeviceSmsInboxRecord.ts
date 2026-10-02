import { Model } from '@nozbe/watermelondb';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';
import type { InboxParseStatus, TransactionDirection } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { SmsNotificationState, SmsScanOrigin } from '@/src/types/smsInbox';

/** One SMS feed on this install. Workplace decisions are projections, not copies of pending SMS. */
export default class DeviceSmsInboxRecord extends Model {
  static table = 'device_sms_inbox_records';
  @field('provider_aliases_json') providerAliasesJson?: string;
  @field('device_source_id') deviceSourceId!: string;
  @field('sender_address') senderAddress?: string;
  @field('raw_body') rawBody?: string;
  @field('input_date') inputDate!: number;
  @field('input_fingerprint') inputFingerprint!: string;
  @field('content_digest') contentDigest?: string;
  @field('parse_status') parseStatus!: InboxParseStatus;
  @field('parsed_amount') parsedAmount?: number;
  @field('parsed_currency_code') parsedCurrencyCode?: string;
  @field('parsed_merchant') parsedMerchant?: string;
  @field('parsed_account_source') parsedAccountSource?: string;
  @field('reference_number') referenceNumber?: string;
  @field('direction') direction!: TransactionDirection;
  @field('parse_confidence') parseConfidence?: number;
  @field('parse_reason') parseReason?: string;
  @field('review_states_json') reviewStatesJson!: string;
  @field('notification_group_id') notificationGroupId?: string;
  @field('notification_state') notificationState!: SmsNotificationState;
  @field('notification_origin') notificationOrigin!: SmsScanOrigin;
  @field('notification_workplace_id') notificationWorkplaceId?: WorkplaceId;
  @field('first_seen_at') firstSeenAt!: number;
  @field('last_scanned_at') lastScannedAt!: number;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
