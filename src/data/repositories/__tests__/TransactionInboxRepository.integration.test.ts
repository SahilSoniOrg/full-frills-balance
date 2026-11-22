import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { TransactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { resetDatabase } from '@/src/testing/resetDatabase';

describe('TransactionInboxRepository integration', () => {
  const repository = new TransactionInboxRepository();
  const workplaceId = 'wp-inbox-owner' as WorkplaceId;

  const persistOps = (prepare: () => Parameters<typeof database.batch>[0]) =>
    database.write(async () => database.batch(prepare()));

  beforeEach(async () => {
    await resetDatabase();
  });

  it('commits repository-prepared create and update operations to the database', async () => {
    const firstPayload = {
      workplaceId,
      channel: 'sms' as const,
      deviceSourceId: 'sms-repository-1',
      senderAddress: 'HDFCBK',
      rawBody: 'Debited INR 500 at SWIGGY',
      inputDate: 1_700_000_000_000,
      inputFingerprint: 'fingerprint-1',
      parseStatus: InboxParseStatus.PARSED,
      parsedAmount: 500,
      parsedCurrencyCode: 'INR',
      parsedMerchant: 'SWIGGY',
      direction: TransactionDirection.DEBIT,
      processingStatus: InboxProcessingStatus.PENDING,
      metadataJson: JSON.stringify({ source: 'integration' }),
      firstSeenAt: 1_700_000_000_000,
      lastScannedAt: 1_700_000_000_000,
    };

    let preparedRecordId!: string;
    await persistOps(() => {
      const prepared = repository.prepareUpsert(firstPayload, null);
      preparedRecordId = prepared.record.id;
      return prepared.ops;
    });

    const created = await repository.find(workplaceId, preparedRecordId);
    expect(created?.deviceSourceId).toBe('sms-repository-1');
    expect(created?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    expect(created?.metadataJson).toBe(JSON.stringify({ source: 'integration' }));

    const secondPayload = {
      ...firstPayload,
      inputFingerprint: 'fingerprint-2',
      processingStatus: InboxProcessingStatus.DUPLICATE_FLAGGED,
      duplicateJournalId: 'journal-duplicate' as JournalId,
      duplicateConfidence: 0.91,
      lastScannedAt: 1_700_000_000_100,
    };

    const legacyModel = await database
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .find(preparedRecordId);
    await persistOps(() => repository.prepareUpsert(secondPayload, legacyModel).ops);

    const updated = await repository.find(workplaceId, preparedRecordId);
    expect(updated?.inputFingerprint).toBe('fingerprint-2');
    expect(updated?.processingStatus).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
    expect(updated?.duplicateJournalId).toBe('journal-duplicate');
    expect(updated?.duplicateConfidence).toBe(0.91);
  });

  describe('raw SMS retention', () => {
    const seed = async (deviceSourceId: string, channel: 'sms' | 'voice' = 'sms') => {
      const record = await database.write(() =>
        database.collections
          .get<TransactionInboxRecord>('transaction_inbox_records')
          .create(entry => {
            entry.workplaceId = workplaceId;
            entry.channel = channel;
            entry.deviceSourceId = deviceSourceId;
            entry.senderAddress = 'HDFCBK';
            entry.rawBody = 'Debited INR 500 at SWIGGY';
            entry.inputDate = 1_700_000_000_000;
            entry.inputFingerprint = `fingerprint-${deviceSourceId}`;
            entry.parseStatus = InboxParseStatus.PARSED;
            entry.direction = TransactionDirection.DEBIT;
            entry.processingStatus = InboxProcessingStatus.PENDING;
            entry.metadataJson = JSON.stringify({ body: 'Debited INR 500 at SWIGGY', keep: 1 });
            entry.firstSeenAt = 1_700_000_000_000;
            entry.lastScannedAt = 1_700_000_000_000;
          }),
      );
      return record.id;
    };

    it('keeps sender and body through dismiss and undismiss, and retains them after import', async () => {
      const recordId = await seed('sms-dismiss-restore');

      await repository.persistStatus(workplaceId, recordId, InboxProcessingStatus.DISMISSED);
      const dismissed = await repository.find(workplaceId, recordId);
      expect(dismissed?.processedAt).toEqual(expect.any(Number));
      expect(dismissed?.senderAddress).toBe('HDFCBK');
      expect(dismissed?.rawBody).toBe('Debited INR 500 at SWIGGY');

      await repository.persistStatus(workplaceId, recordId, InboxProcessingStatus.PENDING);
      const restored = await repository.find(workplaceId, recordId);
      expect(restored?.processedAt).toBeFalsy();
      expect(restored?.senderAddress).toBe('HDFCBK');
      expect(restored?.rawBody).toBe('Debited INR 500 at SWIGGY');

      await repository.persistLink(
        workplaceId,
        recordId,
        'journal-imported' as JournalId,
        InboxProcessingStatus.IMPORTED,
      );
      const imported = await repository.find(workplaceId, recordId);
      expect(imported?.senderAddress).toBe('HDFCBK');
      expect(imported?.rawBody).toBe('Debited INR 500 at SWIGGY');
      expect(imported?.metadataJson).not.toContain('SWIGGY');
    });

    it.each([InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED])(
      'retains sender and body when status becomes %s',
      async status => {
        const recordId = await seed(`sms-status-${status}`);
        await repository.persistStatus(workplaceId, recordId, status);
        const record = await repository.find(workplaceId, recordId);
        expect(record?.senderAddress).toBe('HDFCBK');
        expect(record?.rawBody).toBe('Debited INR 500 at SWIGGY');
      },
    );

    it('unlinks a linked inbox item back to pending', async () => {
      const recordId = await seed('sms-unlink');
      await repository.persistLink(
        workplaceId,
        recordId,
        'journal-unlink' as JournalId,
        InboxProcessingStatus.IMPORTED,
      );
      const linked = await repository.find(workplaceId, recordId);
      expect(linked?.linkedJournalId).toBe('journal-unlink');
      expect(linked?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);

      await repository.persistUnlink(workplaceId, recordId);
      const unlinked = await repository.find(workplaceId, recordId);
      expect(unlinked?.linkedJournalId).toBeFalsy();
      expect(unlinked?.processingStatus).toBe(InboxProcessingStatus.PENDING);
      expect(unlinked?.processedAt).toBeFalsy();
      expect(unlinked?.senderAddress).toBe('HDFCBK');
      expect(unlinked?.rawBody).toBe('Debited INR 500 at SWIGGY');
    });

    it('refuses unlink when the inbox item is not linked', async () => {
      const recordId = await seed('sms-unlink-missing');
      await expect(repository.persistUnlink(workplaceId, recordId)).rejects.toThrow(
        'This source is not linked to a journal',
      );
    });

    it('does not apply SMS cleanup to voice records', async () => {
      const recordId = await seed('voice-imported', 'voice');
      await repository.persistStatus(workplaceId, recordId, InboxProcessingStatus.IMPORTED);
      await repository.persistLink(
        workplaceId,
        recordId,
        'journal-voice' as JournalId,
        InboxProcessingStatus.IMPORTED,
      );
      const record = await repository.find(workplaceId, recordId);
      expect(record?.senderAddress).toBe('HDFCBK');
      expect(record?.rawBody).toBe('Debited INR 500 at SWIGGY');
      expect(JSON.parse(record!.metadataJson!)).toEqual({
        body: 'Debited INR 500 at SWIGGY',
        keep: 1,
      });
    });
  });

  it('clears a self-duplicate when an email is linked to that journal', async () => {
    const journalId = 'journal-email-self' as JournalId;
    const record = await database.write(() =>
      database.collections
        .get<TransactionInboxRecord>('transaction_inbox_records')
        .create(entry => {
          entry.workplaceId = workplaceId;
          entry.channel = 'email';
          entry.deviceSourceId = 'email-self-dup';
          entry.senderAddress = 'bank@example.com';
          entry.inputDate = 1_700_000_000_000;
          entry.inputFingerprint = 'email-self-dup';
          entry.parseStatus = InboxParseStatus.PARSED;
          entry.direction = TransactionDirection.DEBIT;
          entry.processingStatus = InboxProcessingStatus.DUPLICATE_FLAGGED;
          entry.duplicateJournalId = journalId;
          entry.duplicateConfidence = 1;
          entry.metadataJson = JSON.stringify({
            emailSubject: 'Debit alert',
            gmailMessageId: 'msg-1',
            duplicateReasons: ['A similar transaction was already recorded'],
          });
          entry.firstSeenAt = 1_700_000_000_000;
          entry.lastScannedAt = 1_700_000_000_000;
        }),
    );

    await repository.persistLink(workplaceId, record.id, journalId, InboxProcessingStatus.IMPORTED);

    const linked = await repository.find(workplaceId, record.id);
    expect(linked?.linkedJournalId).toBe(journalId);
    expect(linked?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
    expect(linked?.duplicateJournalId).toBeFalsy();
    expect(linked?.duplicateConfidence).toBeFalsy();
    expect(JSON.parse(linked!.metadataJson!)).toEqual({
      emailSubject: 'Debit alert',
      gmailMessageId: 'msg-1',
    });
  });

  it('keeps an email duplicate when the link points at a different journal', async () => {
    const duplicateJournalId = 'journal-email-other' as JournalId;
    const record = await database.write(() =>
      database.collections
        .get<TransactionInboxRecord>('transaction_inbox_records')
        .create(entry => {
          entry.workplaceId = workplaceId;
          entry.channel = 'email';
          entry.deviceSourceId = 'email-other-dup';
          entry.senderAddress = 'bank@example.com';
          entry.inputDate = 1_700_000_000_000;
          entry.inputFingerprint = 'email-other-dup';
          entry.parseStatus = InboxParseStatus.PARSED;
          entry.direction = TransactionDirection.DEBIT;
          entry.processingStatus = InboxProcessingStatus.DUPLICATE_FLAGGED;
          entry.duplicateJournalId = duplicateJournalId;
          entry.duplicateConfidence = 1;
          entry.metadataJson = JSON.stringify({
            emailSubject: 'Debit alert',
            duplicateReasons: ['A similar transaction was already recorded'],
          });
          entry.firstSeenAt = 1_700_000_000_000;
          entry.lastScannedAt = 1_700_000_000_000;
        }),
    );

    await repository.persistLink(
      workplaceId,
      record.id,
      'journal-email-new' as JournalId,
      InboxProcessingStatus.IMPORTED,
    );

    const linked = await repository.find(workplaceId, record.id);
    expect(linked?.linkedJournalId).toBe('journal-email-new');
    expect(linked?.duplicateJournalId).toBe(duplicateJournalId);
    expect(linked?.duplicateConfidence).toBe(1);
    expect(JSON.parse(linked!.metadataJson!).duplicateReasons).toEqual([
      'A similar transaction was already recorded',
    ]);
  });

  it('rejects preparing a row from another workplace', async () => {
    const payload = {
      workplaceId,
      channel: 'sms' as const,
      deviceSourceId: 'sms-repository-2',
      inputDate: 1_700_000_000_000,
      inputFingerprint: 'fingerprint-2',
      parseStatus: InboxParseStatus.PARSED,
      direction: TransactionDirection.UNKNOWN,
      processingStatus: InboxProcessingStatus.PENDING,
      firstSeenAt: 1_700_000_000_000,
      lastScannedAt: 1_700_000_000_000,
    };

    let preparedRecord!: ReturnType<typeof repository.prepareUpsert>['record'];
    await persistOps(() => {
      const prepared = repository.prepareUpsert(payload, null);
      preparedRecord = prepared.record;
      return prepared.ops;
    });

    expect(() =>
      repository.prepareUpsert(
        { ...payload, workplaceId: 'wp-other' as WorkplaceId },
        preparedRecord,
      ),
    ).toThrow('Inbox record does not belong to the specified workplace');
  });

  describe('session staging', () => {
    it('stages an email upsert and link inside one accounting write session', async () => {
      const journalId = 'journal-session-email' as JournalId;
      const emailPayload = {
        workplaceId,
        channel: 'email' as const,
        deviceSourceId: 'email-session-stage-1',
        senderAddress: 'bank@example.com',
        inputDate: 1_700_000_000_000,
        inputFingerprint: 'email-session-stage-1',
        parseStatus: InboxParseStatus.PARSED,
        parsedAmount: 42,
        parsedCurrencyCode: 'USD',
        parsedMerchant: 'Coffee',
        direction: TransactionDirection.DEBIT,
        processingStatus: InboxProcessingStatus.PENDING,
        metadataJson: JSON.stringify({ emailSubject: 'Debit alert', gmailMessageId: 'msg-session' }),
        firstSeenAt: 1_700_000_000_000,
        lastScannedAt: 1_700_000_000_000,
      };

      await runAccountingWriteSession(async session => {
        await repository.stageEmailInSession(session, emailPayload);
      });

      const staged = (await repository.findEmailCopies('email-session-stage-1')).find(
        record => record.workplaceId === workplaceId,
      );
      expect(staged?.channel).toBe('email');
      expect(staged?.processingStatus).toBe(InboxProcessingStatus.PENDING);
      expect(staged?.parsedMerchant).toBe('Coffee');
      expect(staged?.linkedJournalId).toBeFalsy();

      await runAccountingWriteSession(async session => {
        await repository.stageLinkByIdInSession(
          session,
          workplaceId,
          staged!.id,
          journalId,
          InboxProcessingStatus.IMPORTED,
        );
      });

      const linked = await repository.find(workplaceId, staged!.id);
      expect(linked?.linkedJournalId).toBe(journalId);
      expect(linked?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
      expect(linked?.processedAt).toEqual(expect.any(Number));
    });
  });
});
