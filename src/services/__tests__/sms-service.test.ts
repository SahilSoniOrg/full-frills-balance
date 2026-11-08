import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import ExpoSmsInbox from '@/modules/expo-sms-inbox';
import { smsService } from '@/src/services/sms-service';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import { database } from '@/src/data/database/Database';
import { PermissionsAndroid, Platform } from 'react-native';
import { resetDatabase } from '@/src/testing/resetDatabase';

jest.mock('@/modules/expo-sms-inbox', () => ({
  __esModule: true,
  default: { getSmsInbox: jest.fn(), getSmsInboxBefore: jest.fn() },
}));
jest.mock('@/src/services/sms/pipeline/smsSyncPipeline', () => ({
  smsSyncPipeline: { scanMessages: jest.fn().mockResolvedValue(0) },
}));
jest.mock('@/src/services/sms/SmsPrivacyService', () => ({
  smsPrivacyService: { cleanupLegacyContent: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/src/utils/logger');

describe('smsService.parseTransactionMessage', () => {
  it('parses INR debit messages with merchant and account source', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-1',
      address: 'HDFCBK',
      body: 'Your card XX1234 is debited by INR 1,299.50 at SWIGGY on 07-03. Ref 12345678',
      date: 1700000000000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.PARSED);
    expect(parsed.type).toBe('debit');
    expect(parsed.amount).toBe(1299.5);
    expect(parsed.currencyCode).toBe('INR');
    expect(parsed.merchant).toBe('SWIGGY');
    expect(parsed.accountSource).toBe('Card 1234');
    expect(parsed.referenceNumber).toBe('12345678');
  });

  it('parses symbol-based foreign currency messages', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-2',
      address: 'AMEX',
      body: 'Amt $24.99 spent at NETFLIX on your card 9876',
      date: 1700000001000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.PARSED);
    expect(parsed.amount).toBe(24.99);
    expect(parsed.currencyCode).toBe('USD');
    expect(parsed.merchant).toBe('NETFLIX');
    expect(parsed.type).toBe('debit');
  });

  it('marks transaction-like messages without amount as parse failed', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-3',
      address: 'ICICIB',
      body: 'Your account was debited at AMAZON. Balance available is 5000.',
      date: 1700000002000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.PARSE_FAILED);
    expect(parsed.parseReason).toContain('supported amount');
  });

  it('ignores personal sender messages', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-4',
      address: '+919999999999',
      body: 'Hey, can you send me 500?',
      date: 1700000003000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.IGNORED);
    expect(parsed.parseReason).toContain('Personal');
  });
});

describe('smsService workplace isolation', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('limits record-id and linked-journal reads to the requested workplace', async () => {
    const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const createRecord = async (workplaceId: WorkplaceId, linkedJournalId: JournalId) =>
      database.write(async () =>
        inbox.create(record => {
          record.workplaceId = workplaceId;
          record.channel = 'sms';
          record.deviceSourceId = `${workplaceId}-sms`;
          record.senderAddress = 'BANK';
          record.rawBody = 'Coffee purchase';
          record.inputDate = Date.now();
          record.inputFingerprint = `${workplaceId}-fingerprint`;
          record.parseStatus = InboxParseStatus.PARSED;
          record.direction = TransactionDirection.DEBIT;
          record.processingStatus = InboxProcessingStatus.IMPORTED;
          record.linkedJournalId = linkedJournalId;
          record.firstSeenAt = Date.now();
          record.lastScannedAt = Date.now();
        }),
      );

    const workplaceId = 'wp-1' as WorkplaceId;
    const otherWorkplaceId = 'wp-2' as WorkplaceId;
    const sharedJournalId = 'shared-journal' as JournalId;
    const foreignRecord = await createRecord(otherWorkplaceId, sharedJournalId);
    const currentRecord = await createRecord(workplaceId, sharedJournalId);
    const secondCurrentRecord = await createRecord(workplaceId, sharedJournalId);

    expect(await transactionInboxRepository.find(workplaceId, foreignRecord.id)).toBeNull();
    expect([currentRecord.id, secondCurrentRecord.id]).toContain(
      (await smsService.findAllByLinkedJournalId(workplaceId, sharedJournalId))[0]?.id,
    );
    expect(
      (await smsService.findAllByLinkedJournalId(workplaceId, sharedJournalId)).map(r => r.id),
    ).toEqual(expect.arrayContaining([currentRecord.id, secondCurrentRecord.id]));

    await smsService.markInboxRecordStatus(
      workplaceId,
      foreignRecord.id,
      InboxProcessingStatus.DISMISSED,
    );
    await smsService.linkSmsToJournal(
      workplaceId,
      foreignRecord.id,
      'wrong-workplace-journal' as JournalId,
      InboxProcessingStatus.AUTO_POSTED,
    );

    expect(foreignRecord.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
    expect(foreignRecord.linkedJournalId).toBe(sharedJournalId);
  });
});

describe('useTransactionInboxViewModel custom description template parsing', () => {
  it('substitutes merchant, amount, reference number, and sender correctly', () => {
    const customDescription = 'Ingested: {merchant} of value {amount} with Ref {ref} from {sender}';
    const item = {
      parsedMerchant: 'ZOMATO',
      parsedAmount: 349.5,
      referenceNumber: 'REF112233',
      senderAddress: 'ICICIBK',
    };

    const resolved = customDescription
      .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
      .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
      .replace(/{ref}/gi, item.referenceNumber || '')
      .replace(/{sender}/gi, item.senderAddress || '');

    expect(resolved).toBe('Ingested: ZOMATO of value 349.5 with Ref REF112233 from ICICIBK');
  });

  it('handles empty properties gracefully by using fallbacks', () => {
    const customDescription = 'Transaction at {merchant} with Ref {ref}';
    const item = {
      parsedMerchant: undefined,
      parsedAmount: undefined,
      referenceNumber: undefined,
      senderAddress: 'HDFCBK',
    };

    const resolved = customDescription
      .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
      .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
      .replace(/{ref}/gi, item.referenceNumber || '')
      .replace(/{sender}/gi, item.senderAddress || '');

    expect(resolved).toBe('Transaction at Unknown Merchant with Ref ');
  });
});

describe('smsService pagination', () => {
  it('scans past 500 with a fixed page size and handles equal timestamps using provider IDs', async () => {
    const previousOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const permission = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    const messages = Array.from({ length: 600 }, (_, index) => ({
      id: String(600 - index),
      date: Math.floor((600 - index) / 2),
      address: 'BANK',
      body: 'fixture',
    }));
    jest
      .mocked(ExpoSmsInbox!.getSmsInbox)
      .mockImplementation(async limit => messages.slice(0, limit));
    jest
      .mocked(ExpoSmsInbox!.getSmsInboxBefore)
      .mockImplementation(async (date, id, limit) =>
        messages
          .filter(
            message =>
              message.date < date || (message.date === date && Number(message.id) < Number(id)),
          )
          .slice(0, limit),
      );
    try {
      const first = await smsService.scanRecentSmsPage('workplace' as WorkplaceId, 500);
      const second = await smsService.scanOlderSmsPage(
        first.cursor,
        'workplace' as WorkplaceId,
        25,
      );
      expect(first.cursor).toEqual({ date: 50, id: '101' });
      expect(ExpoSmsInbox!.getSmsInboxBefore).toHaveBeenCalledWith(50, '101', 25);
      expect(jest.mocked(smsSyncPipeline.scanMessages).mock.calls[1][1][0].id).toBe('100');
      expect(second.cursor?.id).toBe('76');
      expect(
        jest.mocked(smsSyncPipeline.scanMessages).mock.calls.flatMap(call => call[1]),
      ).toHaveLength(525);
    } finally {
      permission.mockRestore();
      Object.defineProperty(Platform, 'OS', { value: previousOs, configurable: true });
    }
  });
});
