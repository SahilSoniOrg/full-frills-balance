import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';

type InboxRecordPersistedFields = Omit<
  InboxRecordSnapshot,
  | 'id'
  | 'deviceInboxId'
  | 'consumedWorkplaces'
  | 'suggestedSourceAccountId'
  | 'suggestedCategoryAccountId'
>;

function inboxPersistedFields(
  source: Pick<InboxRecordSnapshot, keyof InboxRecordPersistedFields>,
): InboxRecordPersistedFields {
  return {
    workplaceId: source.workplaceId,
    channel: source.channel,
    deviceSourceId: source.deviceSourceId,
    senderAddress: source.senderAddress,
    rawBody: source.rawBody,
    inputDate: source.inputDate,
    inputFingerprint: source.inputFingerprint,
    parseStatus: source.parseStatus,
    parsedAmount: source.parsedAmount,
    parsedCurrencyCode: source.parsedCurrencyCode,
    parsedMerchant: source.parsedMerchant,
    parsedAccountSource: source.parsedAccountSource,
    referenceNumber: source.referenceNumber,
    direction: source.direction,
    processingStatus: source.processingStatus,
    linkedJournalId: source.linkedJournalId,
    duplicateJournalId: source.duplicateJournalId,
    duplicateConfidence: source.duplicateConfidence,
    metadataJson: source.metadataJson,
    parseConfidence: source.parseConfidence,
    parseReason: source.parseReason,
    firstSeenAt: source.firstSeenAt,
    lastScannedAt: source.lastScannedAt,
    processedAt: source.processedAt,
  };
}

export function inboxSnapshotFromRecord(record: TransactionInboxRecord): InboxRecordSnapshot {
  return { id: record.id, ...inboxPersistedFields(record) };
}

export function applyInboxWriteData(
  record: TransactionInboxRecord,
  data: TransactionInboxRecordWriteData,
): void {
  Object.assign(record, inboxPersistedFields(data));
}
