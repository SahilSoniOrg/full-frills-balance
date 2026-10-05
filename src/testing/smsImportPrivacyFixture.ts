import type { BatchImportData } from '@/src/types/importContracts';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';

export const SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT = 'private-sender::private message::19675';

export function smsImportPrivacyBatch(): BatchImportData {
  const base = {
    deviceSourceId: 'device-id',
    senderAddress: 'PrivateSender',
    rawBody: 'PrivateMerchant message 500',
    inputDate: 1_700_000_000_000,
    inputFingerprint: SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT,
    parseStatus: InboxParseStatus.PARSED,
    parsedAmount: 500,
    parsedCurrencyCode: 'INR',
    parsedMerchant: 'Merchant',
    direction: TransactionDirection.DEBIT,
    processingStatus: InboxProcessingStatus.IMPORTED,
    linkedJournalId: 'journal-imported' as never,
    metadataJson: JSON.stringify({
      body: 'PrivateMerchant message 500',
      sender: 'PrivateSender',
    }),
    firstSeenAt: 1_700_000_000_000,
    lastScannedAt: 1_700_000_000_000,
  };
  return {
    accounts: [],
    journals: [],
    transactions: [],
    journalMetadata: [
      {
        id: 'legacy-source',
        journalId: 'journal-imported' as never,
        importSource: 'sms',
        originalSmsSender: 'PrivateSender',
        originalSmsBody: 'PrivateMerchant message 500',
        metadataJson: JSON.stringify({
          rawBody: 'PrivateMerchant message 500',
          smsFingerprint: SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT,
        }),
      },
    ],
    transactionInboxRecords: [
      { ...base, id: 'voice-imported', channel: 'voice' },
      {
        ...base,
        id: 'sms-imported',
        channel: 'sms',
        metadataJson: JSON.stringify({
          importSource: 'sms',
          body: 'PrivateMerchant message 500',
          sender: 'PrivateSender',
          parsedMerchant: 'Merchant',
          amount: 500,
        }),
      },
      {
        ...base,
        id: 'sms-dismissed',
        channel: 'sms',
        processingStatus: InboxProcessingStatus.DISMISSED,
        linkedJournalId: undefined,
      },
    ],
  };
}
