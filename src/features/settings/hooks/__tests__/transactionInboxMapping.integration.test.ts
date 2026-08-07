import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import { enrichTransactionInboxRecords } from '@/src/features/settings/hooks/transactionInboxMapping';
import { AppConfig } from '@/src/constants';
import { smsService } from '@/src/services/sms-service';
import { JournalId } from '@/src/types/domain';
import {
  resetSmsTestDb,
  seedExpenseJournal,
  seedInboxRecord,
  seedSmsTestAccounts,
  SMS_TEST_WORKPLACE,
} from '@/src/testing/smsTestHarness';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

describe('transactionInboxMapping integration', () => {
  const workplaceId = SMS_TEST_WORKPLACE;
  let cashId: string;
  let expenseId: string;

  beforeEach(async () => {
    await resetSmsTestDb();
    ({ cashId, expenseId } = await seedSmsTestAccounts());
  }, 15000);

  async function seedDuplicateInboxRecord(): Promise<{
    record: TransactionInboxRecord;
    journalId: JournalId;
  }> {
    const journal = await seedExpenseJournal({
      cashId,
      expenseId,
      amount: 250,
      description: 'UPI Payment',
      journalDate: Date.now(),
    });

    const record = await seedInboxRecord({
      deviceSourceId: 'dup-mapping-1',
      referenceNumber: '121554846690',
      duplicateJournalId: journal.id,
      duplicateConfidence: AppConfig.input.sms.duplicateDetection.referenceMatchScore,
      processingStatus: InboxProcessingStatus.DUPLICATE_FLAGGED,
      parsedAmount: 250,
      rawBody: 'INR 250.00 debited (UPI Ref No 121554846690) on 07-Mar.',
      metadataJson: JSON.stringify({
        duplicateReasons: ['Matching reference number (121554846690)'],
      }),
    });

    return { record, journalId: journal.id };
  }

  it('builds duplicateCandidate from persisted inbox fields', async () => {
    const { record, journalId } = await seedDuplicateInboxRecord();

    const [item] = await enrichTransactionInboxRecords(workplaceId, [record]);

    expect(item.duplicateCandidate).toEqual(
      expect.objectContaining({
        journalId,
        score: AppConfig.input.sms.duplicateDetection.referenceMatchScore,
        reasons: ['Matching reference number (121554846690)'],
        description: 'UPI Payment',
      }),
    );
  });

  it('observeInbox duplicates filter returns only DUPLICATE_FLAGGED records', async () => {
    const { record: duplicateRecord } = await seedDuplicateInboxRecord();

    await seedInboxRecord({
      deviceSourceId: 'pending-mapping-1',
      processingStatus: InboxProcessingStatus.PENDING,
      parsedAmount: 99,
      rawBody: 'Pending only',
      inputFingerprint: 'pending-mapping-fp',
    });

    const records = await firstValueFrom(
      smsService.observeInbox(workplaceId, 10, { status: 'duplicates' }).pipe(take(1)),
    );

    expect(records.map(r => r.id)).toEqual([duplicateRecord.id]);
  });

  it('observeInbox pending filter excludes duplicate-flagged records', async () => {
    await seedDuplicateInboxRecord();

    await seedInboxRecord({
      deviceSourceId: 'pending-mapping-2',
      processingStatus: InboxProcessingStatus.PENDING,
      parsedAmount: 99,
      rawBody: 'Still pending',
      inputFingerprint: 'pending-mapping-fp-2',
    });

    const records = await firstValueFrom(
      smsService.observeInbox(workplaceId, 10, { status: 'pending' }).pipe(take(1)),
    );

    expect(records.every(r => r.processingStatus === InboxProcessingStatus.PENDING)).toBe(true);
    expect(records.some(r => r.deviceSourceId === 'pending-mapping-2')).toBe(true);
    expect(records.some(r => r.deviceSourceId === 'dup-mapping-1')).toBe(false);
  });
});
