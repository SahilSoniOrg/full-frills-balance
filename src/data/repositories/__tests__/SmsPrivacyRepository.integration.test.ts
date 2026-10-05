import { database } from '@/src/data/database/Database';
import AuditLog from '@/src/data/models/AuditLog';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { SmsPrivacyRepository } from '@/src/data/repositories/SmsPrivacyRepository';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { resetDatabase } from '@/src/testing/resetDatabase';

const WORKPLACE = 'wp-sms-privacy' as never;
const repository = new SmsPrivacyRepository();

describe('SmsPrivacyRepository integration', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('retains SMS sources and journal metadata, hashes old identities, sanitizes audits, and is idempotent', async () => {
    await database.write(async () => {
      const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
      const makeInbox = (id: string, channel: string, status: InboxProcessingStatus) =>
        inbox.prepareCreate(record => {
          record._raw.id = id;
          record.workplaceId = WORKPLACE;
          record.channel = channel as never;
          record.deviceSourceId = `device-${id}`;
          record.senderAddress = 'PrivateBank';
          record.rawBody = 'PrivateMerchant purchase 500';
          record.inputDate = 1_700_000_000_000;
          record.inputFingerprint = 'privatebank::privatemerchant purchase 500::19675';
          record.parseStatus = InboxParseStatus.PARSED;
          record.parsedAmount = 500;
          record.parsedCurrencyCode = 'INR';
          record.parsedMerchant = 'Merchant';
          record.direction = TransactionDirection.DEBIT;
          record.processingStatus = status;
          record.metadataJson = JSON.stringify({
            importSource: 'sms',
            body: 'PrivateMerchant purchase 500',
            sender: 'PrivateBank',
            smsFingerprint: 'privatebank::privatemerchant purchase 500::19675',
          });
          record.firstSeenAt = 1_700_000_000_000;
          record.lastScannedAt = 1_700_000_000_000;
        });

      const metadata = database.collections.get<JournalMetadata>('journal_metadata');
      const smsJournalMetadata = metadata.prepareCreate(record => {
        record._raw.id = 'sms-journal-meta';
        record.workplaceId = WORKPLACE;
        Object.assign(record._raw, { journal_id: 'journal-sms' });
        record.importSource = 'sms';
        record.originalSmsId = 'device-sms';
        record.originalSmsSender = 'PrivateBank';
        record.originalSmsBody = 'PrivateMerchant purchase 500';
        record.metadataJson = JSON.stringify({
          smsFingerprint: 'privatebank::privatemerchant purchase 500::19675',
          rawBody: 'PrivateMerchant purchase 500',
          parsedMerchant: 'Merchant',
          amount: 500,
        });
      });
      const voiceJournalMetadata = metadata.prepareCreate(record => {
        record._raw.id = 'voice-journal-meta';
        record.workplaceId = WORKPLACE;
        Object.assign(record._raw, { journal_id: 'journal-voice' });
        record.importSource = 'voice';
        record.metadataJson = JSON.stringify({ body: 'keep voice note', sender: 'keep source' });
      });
      const auditLogs = database.collections.get<AuditLog>('audit_logs');
      const audit = auditLogs.prepareCreate(record => {
        record._raw.id = 'sms-audit';
        record.workplaceId = WORKPLACE;
        record.entityType = 'journal';
        record.entityId = 'journal-sms';
        record.action = 'UPDATE' as never;
        record.changes = JSON.stringify({
          before: {
            amount: 500,
            notes: 'user note',
            originalSmsBody: 'PrivateMerchant purchase 500',
          },
          after: {
            amount: 500,
            originalSmsSender: 'PrivateBank',
            smsFingerprint: 'privatebank::privatemerchant purchase 500::19675',
          },
        });
        record.timestamp = Date.now();
        record.source = 'app';
        record.eventType = 'journal.updated';
        record.correlationId = null;
      });
      await database.batch(
        makeInbox('sms-dismissed', 'sms', InboxProcessingStatus.DISMISSED),
        makeInbox('sms-imported', 'sms', InboxProcessingStatus.IMPORTED),
        makeInbox('sms-auto-posted', 'sms', InboxProcessingStatus.AUTO_POSTED),
        makeInbox('sms-pending', 'sms', InboxProcessingStatus.PENDING),
        makeInbox('voice-dismissed', 'voice', InboxProcessingStatus.DISMISSED),
        smsJournalMetadata,
        voiceJournalMetadata,
        audit,
      );
    });

    await repository.sanitizeLegacySmsData();

    const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const dismissed = await inbox.find('sms-dismissed');
    const imported = await inbox.find('sms-imported');
    const autoPosted = await inbox.find('sms-auto-posted');
    const pending = await inbox.find('sms-pending');
    const voice = await inbox.find('voice-dismissed');
    expect(dismissed.senderAddress).toBe('PrivateBank');
    expect(dismissed.rawBody).toContain('PrivateMerchant');
    expect(dismissed.inputFingerprint).toBe(
      hashLegacySmsFingerprint('privatebank::privatemerchant purchase 500::19675'),
    );
    for (const terminal of [imported, autoPosted]) {
      expect(terminal.senderAddress).toBe('PrivateBank');
      expect(terminal.rawBody).toBe('PrivateMerchant purchase 500');
      expect(terminal.inputFingerprint).toBe(
        hashLegacySmsFingerprint('privatebank::privatemerchant purchase 500::19675'),
      );
    }
    expect(pending.senderAddress).toBe('PrivateBank');
    expect(pending.rawBody).toContain('PrivateMerchant');
    expect(voice.senderAddress).toBe('PrivateBank');
    expect(voice.rawBody).toContain('PrivateMerchant');
    expect(dismissed.metadataJson).toContain('PrivateMerchant');

    const metadata = database.collections.get<JournalMetadata>('journal_metadata');
    const smsMeta = await metadata.find('sms-journal-meta');
    const voiceMeta = await metadata.find('voice-journal-meta');
    expect(smsMeta.originalSmsSender).toBe('PrivateBank');
    expect(smsMeta.originalSmsBody).toBe('PrivateMerchant purchase 500');
    expect(smsMeta.metadataJson).toContain('PrivateMerchant');
    expect(smsMeta.metadataJson).toContain('Merchant');
    expect(smsMeta.metadataJson).toContain('500');
    expect(JSON.parse(voiceMeta.metadataJson!)).toEqual({
      body: 'keep voice note',
      sender: 'keep source',
    });

    const audit = await database.collections.get<AuditLog>('audit_logs').find('sms-audit');
    expect(audit.changes).not.toContain('PrivateMerchant');
    expect(audit.changes).not.toContain('PrivateBank');
    expect(audit.changes).toContain('user note');
    expect(audit.changes).toContain('500');
    const afterFirstPass = [
      dismissed.inputFingerprint,
      imported.inputFingerprint,
      autoPosted.inputFingerprint,
      smsMeta.metadataJson,
      audit.changes,
    ];

    await repository.sanitizeLegacySmsData();
    const auditAgain = await database.collections.get<AuditLog>('audit_logs').find('sms-audit');
    expect([
      dismissed.inputFingerprint,
      imported.inputFingerprint,
      autoPosted.inputFingerprint,
      smsMeta.metadataJson,
      auditAgain.changes,
    ]).toEqual(afterFirstPass);
  });

  it('writes nothing on a rerun when scrubbed rows have no metadata', async () => {
    await database.write(async () => {
      await database.collections
        .get<TransactionInboxRecord>('transaction_inbox_records')
        .create(record => {
          record.workplaceId = WORKPLACE;
          record.channel = 'sms';
          record.deviceSourceId = 'device-clean';
          record.inputDate = 1_700_000_000_000;
          record.inputFingerprint = hashLegacySmsFingerprint('bank::spent::19675');
          record.parseStatus = InboxParseStatus.PARSED;
          record.direction = TransactionDirection.DEBIT;
          record.processingStatus = InboxProcessingStatus.IMPORTED;
          record.firstSeenAt = 1_700_000_000_000;
          record.lastScannedAt = 1_700_000_000_000;
        });
      await database.collections.get<JournalMetadata>('journal_metadata').create(record => {
        record.workplaceId = WORKPLACE;
        Object.assign(record._raw, { journal_id: 'journal-clean' });
        record.importSource = 'sms';
      });
    });
    const batchSpy = jest.spyOn(database, 'batch');

    await repository.sanitizeLegacySmsData();

    expect(batchSpy).not.toHaveBeenCalled();
    batchSpy.mockRestore();
  });
});
