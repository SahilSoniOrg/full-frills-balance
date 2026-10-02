import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { TransactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';

describe('TransactionInboxRepository integration', () => {
  const repository = new TransactionInboxRepository();
  const workplaceId = 'wp-inbox-owner' as WorkplaceId;

  const persistOps = (prepare: () => Parameters<typeof database.batch>[0]) =>
    database.write(async () => database.batch(prepare()));

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
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
});
