import { database } from '@/src/data/database/Database';
import TransactionInboxRecord, {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
} from '@/src/data/models/TransactionInboxRecord';
import { assembleCreateJournalData } from '@/src/services/journal/journalSaveHelpers';
import { AccountId, TransactionType, WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn().mockResolvedValue('USD'),
  },
}));

describe('journalSaveHelpers workplace isolation', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('populates smsMetadataJson when SMS record belongs to the same workplace', async () => {
    let inboxRecordId = '';
    await database.write(async () => {
      const record = await database.collections
        .get<TransactionInboxRecord>('transaction_inbox_records')
        .create(r => {
          r.workplaceId = 'wp-1' as WorkplaceId;
          r.channel = 'sms';
          r.deviceSourceId = 'dev-1';
          r.inputDate = Date.now();
          r.inputFingerprint = 'fp-same-wp';
          r.parseStatus = InboxParseStatus.PARSED;
          r.parsedAmount = 50;
          r.parsedCurrencyCode = 'USD';
          r.parsedMerchant = 'Store A';
          r.referenceNumber = 'REF12345';
          r.direction = TransactionDirection.DEBIT;
          r.processingStatus = InboxProcessingStatus.PENDING;
          r.firstSeenAt = Date.now();
          r.lastScannedAt = Date.now();
        });
      inboxRecordId = record.id;
    });

    const result = await assembleCreateJournalData({
      lines: [
        {
          id: 'line-1' as any,
          accountId: 'acc-1' as AccountId,
          accountName: 'Cash',
          accountType: 'ASSET' as any,
          amount: '50',
          transactionType: TransactionType.DEBIT,
          notes: '',
          exchangeRate: '1',
        },
        {
          id: 'line-2' as any,
          accountId: 'acc-2' as AccountId,
          accountName: 'Expense',
          accountType: 'EXPENSE' as any,
          amount: '50',
          transactionType: TransactionType.CREDIT,
          notes: '',
          exchangeRate: '1',
        },
      ],
      description: 'Test purchase',
      journalDate: Date.now(),
      smsId: 'msg-1',
      smsRecordId: inboxRecordId,
      workplaceId: 'wp-1' as WorkplaceId,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.journalData.metadata?.metadataJson).toBeDefined();
      const parsed = JSON.parse(result.journalData.metadata?.metadataJson!);
      expect(parsed.smsFingerprint).toBe('fp-same-wp');
      expect(parsed.parsedAmount).toBe(50);
      expect(parsed.parsedMerchant).toBe('Store A');
    }
  });

  it('rejects SMS metadata when SMS record belongs to a different workplace', async () => {
    let inboxRecordId = '';
    await database.write(async () => {
      const record = await database.collections
        .get<TransactionInboxRecord>('transaction_inbox_records')
        .create(r => {
          r.workplaceId = 'wp-2' as WorkplaceId;
          r.channel = 'sms';
          r.deviceSourceId = 'dev-2';
          r.inputDate = Date.now();
          r.inputFingerprint = 'fp-foreign-wp';
          r.parseStatus = InboxParseStatus.PARSED;
          r.parsedAmount = 100;
          r.parsedCurrencyCode = 'USD';
          r.parsedMerchant = 'Foreign Store';
          r.referenceNumber = 'REF-FOREIGN';
          r.direction = TransactionDirection.DEBIT;
          r.processingStatus = InboxProcessingStatus.PENDING;
          r.firstSeenAt = Date.now();
          r.lastScannedAt = Date.now();
        });
      inboxRecordId = record.id;
    });

    const result = await assembleCreateJournalData({
      lines: [
        {
          id: 'line-1' as any,
          accountId: 'acc-1' as AccountId,
          accountName: 'Cash',
          accountType: 'ASSET' as any,
          amount: '50',
          transactionType: TransactionType.DEBIT,
          notes: '',
          exchangeRate: '1',
        },
        {
          id: 'line-2' as any,
          accountId: 'acc-2' as AccountId,
          accountName: 'Expense',
          accountType: 'EXPENSE' as any,
          amount: '50',
          transactionType: TransactionType.CREDIT,
          notes: '',
          exchangeRate: '1',
        },
      ],
      description: 'Test purchase in wp-1',
      journalDate: Date.now(),
      smsId: 'msg-foreign',
      smsRecordId: inboxRecordId,
      workplaceId: 'wp-1' as WorkplaceId,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.journalData.metadata?.metadataJson).toBeUndefined();
    }
  });
});
