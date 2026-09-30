import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { prepareAuxiliaryImportRecords } from '@/src/data/repositories/importAuxiliaryWriters';
import type { BatchImportData } from '@/src/types/importContracts';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

const WORKPLACE = 'wp-import-inbox-privacy' as never;
const LEGACY_FINGERPRINT = 'private-sender::private message::19675';

describe('import inbox privacy integration', () => {
  beforeEach(async () => {
    await database.write(() => database.unsafeResetDatabase());
  });

  it('applies terminal SMS cleanup only to SMS inbox records', async () => {
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
      ],
    };

    await database.write(async () => {
      await database.batch(...prepareAuxiliaryImportRecords(WORKPLACE, data));
    });

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
    expect(sms.senderAddress).toBeFalsy();
    expect(sms.rawBody).toBeFalsy();
    expect(sms.inputFingerprint).toBe(hashLegacySmsFingerprint(LEGACY_FINGERPRINT));
    expect(sms.metadataJson).not.toContain('PrivateMerchant');
    expect(sms.metadataJson).not.toContain('PrivateSender');
    expect(sms.metadataJson).toContain('Merchant');
    expect(sms.metadataJson).toContain('500');
  });
});
