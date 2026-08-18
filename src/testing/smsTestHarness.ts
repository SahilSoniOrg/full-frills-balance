import ExpoSmsInbox, { SmsMessage } from '@/modules/expo-sms-inbox';
import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
  AccountType,
  AccountId,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { ledgerWriteService } from '@/src/services/ledger';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { SmsParser } from '@/src/services/ledger/SmsParser';
import { smsService } from '@/src/services/sms-service';
import { smsSyncPipeline } from '@/src/services/sms/SmsSyncPipeline';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { Q } from '@nozbe/watermelondb';
import { smsMessageFromFixture, SmsFixtureKey } from './smsFixtures';

export const SMS_TEST_WORKPLACE = 'wp-sms-test' as WorkplaceId;
export const SMS_TEST_WORKPLACE_B = 'wp-sms-test-b' as WorkplaceId;

export async function resetSmsTestDb(): Promise<void> {
  rebuildQueueService.stop();
  smsService.clearProcessedMessages();
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

export async function seedSmsTestAccounts(workplaceId: WorkplaceId = SMS_TEST_WORKPLACE): Promise<{
  cashId: string;
  expenseId: string;
}> {
  const cash = await accountRepository.create({
    name: 'Cash',
    accountType: AccountType.ASSET,
    currencyCode: 'INR',
    workplaceId,
  });
  const expense = await accountRepository.create({
    name: 'Food',
    accountType: AccountType.EXPENSE,
    currencyCode: 'INR',
    workplaceId,
  });
  return { cashId: cash.id, expenseId: expense.id };
}

export async function seedExpenseJournal(params: {
  workplaceId?: WorkplaceId;
  cashId: string;
  expenseId: string;
  amount: number;
  description: string;
  journalDate: number;
  metadata?: {
    importSource: string;
    originalSmsId?: string;
    originalSmsSender?: string;
    originalSmsBody?: string;
    metadataJson?: string;
  };
}): Promise<{ id: JournalId; totalAmount: number }> {
  const workplaceId = params.workplaceId ?? SMS_TEST_WORKPLACE;
  const journal = await ledgerWriteService.createJournal(
    {
      description: params.description,
      journalDate: params.journalDate,
      currencyCode: 'INR',
      metadata: params.metadata,
      transactions: [
        {
          accountId: params.cashId as AccountId,
          amount: params.amount,
          transactionType: TransactionType.CREDIT,
        },
        {
          accountId: params.expenseId as AccountId,
          amount: params.amount,
          transactionType: TransactionType.DEBIT,
        },
      ],
    },
    workplaceId,
  );
  await rebuildQueueService.flush();
  return { id: journal.id, totalAmount: journal.totalAmount };
}

export async function seedInboxRecord(params: {
  workplaceId?: WorkplaceId;
  deviceSourceId: string;
  referenceNumber?: string;
  linkedJournalId?: JournalId;
  duplicateJournalId?: JournalId;
  duplicateConfidence?: number;
  processingStatus: InboxProcessingStatus;
  inputFingerprint?: string;
  parsedAmount?: number;
  rawBody?: string;
  senderAddress?: string;
  inputDate?: number;
  firstSeenAt?: number;
  metadataJson?: string;
}): Promise<TransactionInboxRecord> {
  const workplaceId = params.workplaceId ?? SMS_TEST_WORKPLACE;
  const now = Date.now();
  const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  let created!: TransactionInboxRecord;

  await database.write(async () => {
    created = await inbox.create(record => {
      record.workplaceId = workplaceId;
      record.channel = 'sms';
      record.deviceSourceId = params.deviceSourceId;
      record.senderAddress = params.senderAddress ?? 'HDFCBK';
      record.rawBody = params.rawBody ?? 'seeded inbox record';
      record.inputDate = params.inputDate ?? now;
      record.inputFingerprint = params.inputFingerprint ?? `fp-${params.deviceSourceId}`;
      record.parseStatus = InboxParseStatus.PARSED;
      record.parsedAmount = params.parsedAmount;
      record.parsedCurrencyCode = 'INR';
      record.direction = TransactionDirection.DEBIT;
      record.processingStatus = params.processingStatus;
      record.referenceNumber = params.referenceNumber
        ? normalizeSmsReferenceNumber(params.referenceNumber)
        : undefined;
      record.linkedJournalId = params.linkedJournalId;
      record.duplicateJournalId = params.duplicateJournalId;
      record.duplicateConfidence = params.duplicateConfidence;
      record.metadataJson = params.metadataJson;
      record.firstSeenAt = params.firstSeenAt ?? now;
      record.lastScannedAt = now;
    });
  });

  return created;
}

export function mockAndroidSmsInbox(messages: SmsMessage[]): void {
  (ExpoSmsInbox!.getSmsInbox as jest.Mock).mockResolvedValue(messages);
}

export async function scanSmsInbox(
  workplaceId: WorkplaceId = SMS_TEST_WORKPLACE,
  messages?: SmsMessage[],
): Promise<number> {
  if (messages) {
    mockAndroidSmsInbox(messages);
  }
  return smsSyncPipeline.scanInbox(workplaceId, 50);
}

export async function fetchInboxByDeviceId(
  deviceSourceId: string,
  workplaceId: WorkplaceId = SMS_TEST_WORKPLACE,
): Promise<TransactionInboxRecord | null> {
  const records = await database.collections
    .get<TransactionInboxRecord>('transaction_inbox_records')
    .query(
      Q.where('device_source_id', deviceSourceId),
      Q.where('workplace_id', workplaceId),
      Q.where('channel', 'sms'),
    )
    .fetch();
  return records[0] ?? null;
}

export async function parseFixtureMessage(fixtureKey: SmsFixtureKey, date?: number) {
  return SmsParser.parse(smsMessageFromFixture(fixtureKey, { date }));
}

export function fingerprintForMessage(message: SmsMessage): string {
  return smsSyncPipeline.computeSmsFingerprint(message.address, message.body, message.date);
}

export { smsJournalQueries, smsSyncPipeline };
