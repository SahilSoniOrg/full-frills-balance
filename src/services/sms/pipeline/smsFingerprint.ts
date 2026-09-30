import type { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import type TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { DuplicateMatch } from '@/src/services/sms/smsDuplicateDetection';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

const SMS_CONFIG = AppConfig.input.sms;
const DUPLICATE_CONFIG = SMS_CONFIG.duplicateDetection;

export function computeSmsFingerprint(sender: string, body: string, date: number): string {
  const normalizedSender = sender.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedBody = body
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
  const dateBucket = Math.floor(date / DUPLICATE_CONFIG.fingerprintDayBucketMs);
  return hashLegacySmsFingerprint(
    `${normalizedSender}::${normalizedBody.slice(0, 160)}::${dateBucket}`,
  );
}

/** Fingerprints a redelivery could be stored under; the day bucket may differ across midnight. */
export function redeliveryFingerprintCandidates(message: SmsMessage): string[] {
  const window = DUPLICATE_CONFIG.redeliveryWindowMs;
  return [
    ...new Set(
      [message.date - window, message.date, message.date + window].map(date =>
        computeSmsFingerprint(message.address, message.body, date),
      ),
    ),
  ];
}

/**
 * A stored SMS is the same delivery when its content fingerprint, parsed identity and delivery
 * time (within the redelivery window) all match. Same-template messages outside the window are
 * separate transactions.
 */
export function isStoredRedelivery(
  message: SmsMessage,
  parsed: ParsedTransaction,
  stored: Pick<
    TransactionInboxRecord,
    | 'inputDate'
    | 'inputFingerprint'
    | 'parsedAmount'
    | 'parsedCurrencyCode'
    | 'direction'
    | 'referenceNumber'
  >,
): boolean {
  const reference = parsed.referenceNumber
    ? normalizeSmsReferenceNumber(parsed.referenceNumber)
    : undefined;
  return (
    Math.abs(stored.inputDate - message.date) <= DUPLICATE_CONFIG.redeliveryWindowMs &&
    stored.inputFingerprint ===
      computeSmsFingerprint(message.address, message.body, stored.inputDate) &&
    (stored.parsedAmount ?? undefined) === parsed.amount &&
    (stored.parsedCurrencyCode ?? '').toUpperCase() === (parsed.currencyCode ?? '').toUpperCase() &&
    stored.direction === toTransactionDirection(parsed.type) &&
    (stored.referenceNumber || undefined) === reference
  );
}

export function resolveProcessingStatus(params: {
  parsed: ParsedTransaction;
  processedIds: Set<string>;
  exactJournalId?: string;
  duplicate: DuplicateMatch;
  existingStatus?: InboxProcessingStatus;
}): InboxProcessingStatus {
  const { parsed, processedIds, exactJournalId, duplicate, existingStatus } = params;

  if (existingStatus && existingStatus !== InboxProcessingStatus.PENDING) {
    return existingStatus;
  }
  if (parsed.parseStatus === InboxParseStatus.PARSE_FAILED)
    return InboxProcessingStatus.PARSE_FAILED;
  if (parsed.parseStatus === InboxParseStatus.IGNORED) return InboxProcessingStatus.DISMISSED;
  if (exactJournalId) return InboxProcessingStatus.IMPORTED;
  if (processedIds.has(parsed.id || '')) return InboxProcessingStatus.IMPORTED;
  if (duplicate) return InboxProcessingStatus.DUPLICATE_FLAGGED;
  return InboxProcessingStatus.PENDING;
}
