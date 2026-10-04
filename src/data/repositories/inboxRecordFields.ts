import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';

export type InboxRecordPersistedFields = Omit<
  InboxRecordSnapshot,
  | 'id'
  | 'deviceInboxId'
  | 'consumedWorkplaces'
  | 'suggestedSourceAccountId'
  | 'suggestedCategoryAccountId'
>;

export function inboxFieldsFromWriteData(
  data: TransactionInboxRecordWriteData,
): InboxRecordPersistedFields {
  return {
    workplaceId: data.workplaceId,
    channel: data.channel,
    deviceSourceId: data.deviceSourceId,
    senderAddress: data.senderAddress,
    rawBody: data.rawBody,
    inputDate: data.inputDate,
    inputFingerprint: data.inputFingerprint,
    parseStatus: data.parseStatus,
    parsedAmount: data.parsedAmount,
    parsedCurrencyCode: data.parsedCurrencyCode,
    parsedMerchant: data.parsedMerchant,
    parsedAccountSource: data.parsedAccountSource,
    referenceNumber: data.referenceNumber,
    direction: data.direction,
    processingStatus: data.processingStatus,
    linkedJournalId: data.linkedJournalId,
    duplicateJournalId: data.duplicateJournalId,
    duplicateConfidence: data.duplicateConfidence,
    metadataJson: data.metadataJson,
    parseConfidence: data.parseConfidence,
    parseReason: data.parseReason,
    firstSeenAt: data.firstSeenAt,
    lastScannedAt: data.lastScannedAt,
    processedAt: data.processedAt,
  };
}

export function inboxFieldsFromRecord(record: TransactionInboxRecord): InboxRecordPersistedFields {
  return {
    workplaceId: record.workplaceId,
    channel: record.channel,
    deviceSourceId: record.deviceSourceId,
    senderAddress: record.senderAddress,
    rawBody: record.rawBody,
    inputDate: record.inputDate,
    inputFingerprint: record.inputFingerprint,
    parseStatus: record.parseStatus,
    parsedAmount: record.parsedAmount,
    parsedCurrencyCode: record.parsedCurrencyCode,
    parsedMerchant: record.parsedMerchant,
    parsedAccountSource: record.parsedAccountSource,
    referenceNumber: record.referenceNumber,
    direction: record.direction,
    processingStatus: record.processingStatus,
    linkedJournalId: record.linkedJournalId,
    duplicateJournalId: record.duplicateJournalId,
    duplicateConfidence: record.duplicateConfidence,
    metadataJson: record.metadataJson,
    parseConfidence: record.parseConfidence,
    parseReason: record.parseReason,
    firstSeenAt: record.firstSeenAt,
    lastScannedAt: record.lastScannedAt,
    processedAt: record.processedAt,
  };
}

export function inboxSnapshotFromRecord(record: TransactionInboxRecord): InboxRecordSnapshot {
  return { id: record.id, ...inboxFieldsFromRecord(record) };
}

export function applyInboxWriteData(
  record: TransactionInboxRecord,
  data: TransactionInboxRecordWriteData,
): void {
  const fields = inboxFieldsFromWriteData(data);
  record.workplaceId = fields.workplaceId;
  record.channel = fields.channel;
  record.deviceSourceId = fields.deviceSourceId;
  record.senderAddress = fields.senderAddress;
  record.rawBody = fields.rawBody;
  record.inputDate = fields.inputDate;
  record.inputFingerprint = fields.inputFingerprint;
  record.parseStatus = fields.parseStatus;
  record.parsedAmount = fields.parsedAmount;
  record.parsedCurrencyCode = fields.parsedCurrencyCode;
  record.parsedMerchant = fields.parsedMerchant;
  record.parsedAccountSource = fields.parsedAccountSource;
  record.referenceNumber = fields.referenceNumber;
  record.direction = fields.direction;
  record.processingStatus = fields.processingStatus;
  record.linkedJournalId = fields.linkedJournalId;
  record.duplicateJournalId = fields.duplicateJournalId;
  record.duplicateConfidence = fields.duplicateConfidence;
  record.metadataJson = fields.metadataJson;
  record.parseConfidence = fields.parseConfidence;
  record.parseReason = fields.parseReason;
  record.firstSeenAt = fields.firstSeenAt;
  record.lastScannedAt = fields.lastScannedAt;
  record.processedAt = fields.processedAt;
}
