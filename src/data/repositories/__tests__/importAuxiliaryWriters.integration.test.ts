import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import {
  SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT,
  smsImportPrivacyBatch,
} from '@/src/testing/smsImportPrivacyFixture';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

const WORKPLACE = 'wp-import-inbox-privacy' as never;

describe('import inbox privacy integration', () => {
  beforeEach(async () => {
    await database.write(() => database.unsafeResetDatabase());
  });

  it('retains imported SMS source content and hashes only SMS identities', async () => {
    await importRepository.batchInsert(WORKPLACE, smsImportPrivacyBatch());

    const records = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const voice = await records.find('voice-imported');
    expect(voice.senderAddress).toBe('PrivateSender');
    expect(voice.rawBody).toBe('PrivateMerchant message 500');
    expect(voice.inputFingerprint).toBe(SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT);
    expect(JSON.parse(voice.metadataJson!)).toEqual({
      body: 'PrivateMerchant message 500',
      sender: 'PrivateSender',
    });

    const sms = await records.find('sms-imported');
    expect(sms.senderAddress).toBe('PrivateSender');
    expect(sms.rawBody).toBe('PrivateMerchant message 500');
    expect(sms.inputFingerprint).toBe(
      hashLegacySmsFingerprint(SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT),
    );
    expect(sms.metadataJson).toContain('PrivateMerchant');
    expect(sms.metadataJson).toContain('PrivateSender');
    expect(sms.metadataJson).toContain('Merchant');
    expect(sms.metadataJson).toContain('500');

    const dismissed = await records.find('sms-dismissed');
    expect(dismissed.senderAddress).toBe('PrivateSender');
    expect(dismissed.rawBody).toBe('PrivateMerchant message 500');
    expect(dismissed.inputFingerprint).toBe(
      hashLegacySmsFingerprint(SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT),
    );
    const restoredMetadata = await database
      .get<JournalMetadata>('journal_metadata')
      .find('legacy-source');
    expect(restoredMetadata.originalSmsSender).toBe('PrivateSender');
    expect(restoredMetadata.originalSmsBody).toBe('PrivateMerchant message 500');
    expect(JSON.parse(restoredMetadata.metadataJson!)).toEqual({
      rawBody: 'PrivateMerchant message 500',
      smsFingerprint: hashLegacySmsFingerprint(SMS_IMPORT_PRIVACY_LEGACY_FINGERPRINT),
    });
  });
});
