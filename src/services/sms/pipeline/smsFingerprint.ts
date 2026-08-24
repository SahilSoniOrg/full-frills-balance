import { AppConfig } from '@/src/constants';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { DuplicateMatch } from '@/src/services/sms/smsDuplicateDetection';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';

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
  return `${normalizedSender}::${normalizedBody.slice(0, 160)}::${dateBucket}`;
}

export function toDirection(type: 'debit' | 'credit' | 'unknown'): TransactionDirection {
  return toTransactionDirection(type);
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
