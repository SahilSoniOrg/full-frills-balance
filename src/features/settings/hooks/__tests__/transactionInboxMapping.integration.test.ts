import { database } from '@/src/data/database/Database';
import TransactionInboxRecord, {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
} from '@/src/data/models/TransactionInboxRecord';
import { enrichTransactionInboxRecords } from '@/src/features/settings/hooks/transactionInboxMapping';
import { AppConfig } from '@/src/constants';
import { smsService } from '@/src/services/sms-service';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import {
  resetSmsTestDb,
  seedExpenseJournal,
  seedSmsTestAccounts,
  SMS_TEST_WORKPLACE,
} from '@/src/testing/smsTestHarness';
import { Q } from '@nozbe/watermelondb';
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

    const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    let record!: TransactionInboxRecord;
    const now = Date.now();

    await database.write(async () => {
      record = await inbox.create(entry => {
        entry.workplaceId = workplaceId;
        entry.channel = 'sms';
        entry.deviceSourceId = 'dup-mapping-1';
        entry.senderAddress = 'HDFCBK';
        entry.rawBody = 'INR 250.00 debited (UPI Ref No 121554846690) on 07-Mar.';
        entry.inputDate = now;
        entry.inputFingerprint = 'dup-mapping-fp';
        entry.parseStatus = InboxParseStatus.PARSED;
        entry.parsedAmount = 250;
        entry.parsedCurrencyCode = 'INR';
        entry.parsedMerchant = 'Merchant';
        entry.referenceNumber = '121554846690';
        entry.direction = TransactionDirection.DEBIT;
        entry.processingStatus = InboxProcessingStatus.DUPLICATE_FLAGGED;
        entry.duplicateJournalId = journal.id as JournalId;
        entry.duplicateConfidence = AppConfig.input.sms.duplicateDetection.referenceMatchScore;
        entry.metadataJson = JSON.stringify({
          duplicateReasons: ['Matching reference number (121554846690)'],
        });
        entry.firstSeenAt = now;
        entry.lastScannedAt = now;
      });
    });

    return { record, journalId: journal.id as JournalId };
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
    const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const now = Date.now();

    await database.write(async () => {
      await inbox.create(entry => {
        entry.workplaceId = workplaceId;
        entry.channel = 'sms';
        entry.deviceSourceId = 'pending-mapping-1';
        entry.senderAddress = 'HDFCBK';
        entry.rawBody = 'Pending only';
        entry.inputDate = now;
        entry.inputFingerprint = 'pending-mapping-fp';
        entry.parseStatus = InboxParseStatus.PARSED;
        entry.parsedAmount = 99;
        entry.direction = TransactionDirection.DEBIT;
        entry.processingStatus = InboxProcessingStatus.PENDING;
        entry.firstSeenAt = now;
        entry.lastScannedAt = now;
      });
    });

    const records = await firstValueFrom(
      smsService.observeInbox(workplaceId, 10, { status: 'duplicates' }).pipe(take(1)),
    );

    expect(records.map(r => r.id)).toEqual([duplicateRecord.id]);
  });

  it('observeInbox pending filter excludes duplicate-flagged records', async () => {
    await seedDuplicateInboxRecord();
    const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const now = Date.now();

    await database.write(async () => {
      await inbox.create(entry => {
        entry.workplaceId = workplaceId;
        entry.channel = 'sms';
        entry.deviceSourceId = 'pending-mapping-2';
        entry.senderAddress = 'HDFCBK';
        entry.rawBody = 'Still pending';
        entry.inputDate = now;
        entry.inputFingerprint = 'pending-mapping-fp-2';
        entry.parseStatus = InboxParseStatus.PARSED;
        entry.parsedAmount = 99;
        entry.direction = TransactionDirection.DEBIT;
        entry.processingStatus = InboxProcessingStatus.PENDING;
        entry.firstSeenAt = now;
        entry.lastScannedAt = now;
      });
    });

    const records = await firstValueFrom(
      smsService.observeInbox(workplaceId, 10, { status: 'pending' }).pipe(take(1)),
    );

    expect(records.every(r => r.processingStatus === InboxProcessingStatus.PENDING)).toBe(true);
    expect(records.some(r => r.deviceSourceId === 'pending-mapping-2')).toBe(true);
    expect(records.some(r => r.deviceSourceId === 'dup-mapping-1')).toBe(false);
  });
});
