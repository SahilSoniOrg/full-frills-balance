import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { assembleCreateJournalData } from '@/src/services/journal/journalSaveHelpers';

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn().mockResolvedValue('USD'),
  },
}));

const journalLines = () => [
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
];

describe('journalSaveHelpers workplace isolation', () => {
  describe('with mocked inbox repository', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it.each(['msg-1', undefined])(
      'populates metadata from a same-workplace inbox record with device ID %s',
      async smsId => {
        jest.spyOn(transactionInboxRepository, 'find').mockResolvedValue({
          inputFingerprint: 'fp-same-wp',
          parsedAmount: 50,
          parsedCurrencyCode: 'USD',
          parsedMerchant: 'Store A',
          referenceNumber: 'REF12345',
          parsedAccountSource: null,
        } as unknown as Awaited<ReturnType<typeof transactionInboxRepository.find>>);

        const result = await assembleCreateJournalData({
          lines: journalLines(),
          description: 'Test purchase',
          journalDate: Date.now(),
          smsId,
          smsRecordId: 'inbox-1',
          workplaceId: 'wp-1' as WorkplaceId,
        });

        expect(transactionInboxRepository.find).toHaveBeenCalledWith('wp-1', 'inbox-1');
        expect(result.success).toBe(true);
        if (result.success) {
          const parsed = JSON.parse(result.journalData.metadata?.metadataJson!);
          expect(parsed.smsFingerprint).toBe('fp-same-wp');
          expect(parsed.parsedAmount).toBe(50);
          expect(parsed.parsedMerchant).toBe('Store A');
        }
      },
    );

    it('rejects SMS metadata when SMS record belongs to a different workplace', async () => {
      jest.spyOn(transactionInboxRepository, 'find').mockResolvedValue(null);

      const result = await assembleCreateJournalData({
        lines: journalLines(),
        description: 'Test purchase in wp-1',
        journalDate: Date.now(),
        smsId: 'msg-foreign',
        smsRecordId: 'inbox-foreign',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.journalData.metadata?.metadataJson).toBeUndefined();
      }
    });
  });

  describe('database integration', () => {
    beforeEach(async () => {
      jest.restoreAllMocks();
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
    });

    it('loads inbox metadata from a persisted record', async () => {
      let inboxRecordId = '';
      await database.write(async () => {
        const record = await database.collections
          .get<TransactionInboxRecord>('transaction_inbox_records')
          .create(r => {
            r.workplaceId = 'wp-1' as WorkplaceId;
            r.channel = 'sms';
            r.deviceSourceId = 'dev-1';
            r.inputDate = Date.now();
            r.inputFingerprint = 'fp-db';
            r.parseStatus = InboxParseStatus.PARSED;
            r.parsedAmount = 42;
            r.parsedCurrencyCode = 'USD';
            r.parsedMerchant = 'DB Store';
            r.referenceNumber = 'REF-DB';
            r.direction = TransactionDirection.DEBIT;
            r.processingStatus = InboxProcessingStatus.PENDING;
            r.firstSeenAt = Date.now();
            r.lastScannedAt = Date.now();
          });
        inboxRecordId = record.id;
      });

      const result = await assembleCreateJournalData({
        lines: journalLines(),
        description: 'DB-backed metadata',
        journalDate: Date.now(),
        smsRecordId: inboxRecordId,
        workplaceId: 'wp-1' as WorkplaceId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.journalData.metadata?.metadataJson!);
        expect(parsed.smsFingerprint).toBe('fp-db');
        expect(parsed.parsedMerchant).toBe('DB Store');
      }
    });
  });
});
