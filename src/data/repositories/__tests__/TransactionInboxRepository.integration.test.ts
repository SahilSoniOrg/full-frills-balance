import { database } from '@/src/data/database/Database';
import { TransactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';

describe('TransactionInboxRepository integration', () => {
  const repository = new TransactionInboxRepository();
  const workplaceId = 'wp-inbox-owner' as WorkplaceId;

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
    await expect(
      repository.persistScanBatch(async () => {
        const prepared = repository.prepareUpsert(firstPayload, null);
        preparedRecordId = prepared.record.id;
        return prepared.ops;
      }),
    ).resolves.toBe(true);

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

    await expect(
      repository.persistScanBatch(async () => {
        const prepared = repository.prepareUpsert(secondPayload, created!);
        return prepared.ops;
      }),
    ).resolves.toBe(true);

    const updated = await repository.find(workplaceId, preparedRecordId);
    expect(updated?.inputFingerprint).toBe('fingerprint-2');
    expect(updated?.processingStatus).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
    expect(updated?.duplicateJournalId).toBe('journal-duplicate');
    expect(updated?.duplicateConfidence).toBe(0.91);
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
    await repository.persistScanBatch(async () => {
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
