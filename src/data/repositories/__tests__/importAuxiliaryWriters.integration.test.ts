import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import type { BatchImportData } from '@/src/types/importContracts';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

const WORKPLACE = 'wp-import-inbox-privacy' as never;
const LEGACY_FINGERPRINT = 'private-sender::private message::19675';

describe('import inbox privacy integration', () => {
  beforeEach(async () => {
    await database.write(() => database.unsafeResetDatabase());
  });

  it('retains imported SMS source content and hashes only SMS identities', async () => {
    const base = {
      deviceSourceId: 'device-id',
      senderAddress: 'PrivateSender',
      rawBody: 'PrivateMerchant message 500',
      inputDate: 1_700_000_000_000,
      inputFingerprint: LEGACY_FINGERPRINT,
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
    const data: BatchImportData = {
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
            smsFingerprint: LEGACY_FINGERPRINT,
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

    await importRepository.batchInsert(WORKPLACE, data);

    const records = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const voice = await records.find('voice-imported');
    expect(voice.senderAddress).toBe('PrivateSender');
    expect(voice.rawBody).toBe('PrivateMerchant message 500');
    expect(voice.inputFingerprint).toBe(LEGACY_FINGERPRINT);
    expect(JSON.parse(voice.metadataJson!)).toEqual({
      body: 'PrivateMerchant message 500',
      sender: 'PrivateSender',
    });

    const sms = await records.find('sms-imported');
    expect(sms.senderAddress).toBe('PrivateSender');
    expect(sms.rawBody).toBe('PrivateMerchant message 500');
    expect(sms.inputFingerprint).toBe(hashLegacySmsFingerprint(LEGACY_FINGERPRINT));
    expect(sms.metadataJson).toContain('PrivateMerchant');
    expect(sms.metadataJson).toContain('PrivateSender');
    expect(sms.metadataJson).toContain('Merchant');
    expect(sms.metadataJson).toContain('500');

    const dismissed = await records.find('sms-dismissed');
    expect(dismissed.senderAddress).toBe('PrivateSender');
    expect(dismissed.rawBody).toBe('PrivateMerchant message 500');
    expect(dismissed.inputFingerprint).toBe(hashLegacySmsFingerprint(LEGACY_FINGERPRINT));
    const restoredMetadata = await database
      .get<JournalMetadata>('journal_metadata')
      .find('legacy-source');
    expect(restoredMetadata.originalSmsSender).toBe('PrivateSender');
    expect(restoredMetadata.originalSmsBody).toBe('PrivateMerchant message 500');
    expect(JSON.parse(restoredMetadata.metadataJson!)).toEqual({
      rawBody: 'PrivateMerchant message 500',
      smsFingerprint: hashLegacySmsFingerprint(LEGACY_FINGERPRINT),
    });
  });
});
