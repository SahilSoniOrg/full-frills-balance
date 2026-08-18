import { AppConfig } from '@/src/constants';
import { InboxProcessingStatus } from '@/src/types/domain';
import { smsMessageFromFixture } from '@/src/testing/smsFixtures';
import {
  fetchInboxByDeviceId,
  fingerprintForMessage,
  mockAndroidSmsInbox,
  parseFixtureMessage,
  resetSmsTestDb,
  scanSmsInbox,
  seedExpenseJournal,
  seedInboxRecord,
  seedSmsTestAccounts,
  SMS_TEST_WORKPLACE,
  SMS_TEST_WORKPLACE_B,
  smsJournalQueries,
  smsSyncPipeline,
} from '@/src/testing/smsTestHarness';

const mockStorageState = { store: new Map<string, string>() };

jest.mock('@/src/utils/storage', () => ({
  storage: {
    getString: (key: string) => mockStorageState.store.get(key),
    set: (key: string, value: string) => {
      mockStorageState.store.set(key, value);
    },
    remove: (key: string) => {
      mockStorageState.store.delete(key);
    },
    getBoolean: jest.fn(),
    getNumber: jest.fn(),
    contains: jest.fn((key: string) => mockStorageState.store.has(key)),
    clearAll: jest.fn(() => mockStorageState.store.clear()),
  },
  migrateFromAsyncStorage: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/modules/expo-sms-inbox', () => ({
  __esModule: true,
  default: {
    getSmsInbox: jest.fn(),
  },
}));

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'android',
    Version: '30',
    select: jest.fn((obj: Record<string, unknown>) => obj.android || obj.default),
    constants: {
      getConstants: () => ({
        isTesting: true,
        osVersion: '30',
        systemName: 'Android',
      }),
    },
    isPad: false,
    isTVOS: false,
  },
}));

jest.mock('react-native/Libraries/PermissionsAndroid/PermissionsAndroid', () => ({
  __esModule: true,
  default: {
    check: jest.fn().mockResolvedValue(true),
    request: jest.fn().mockResolvedValue('granted'),
    RESULTS: { GRANTED: 'granted' },
    PERMISSIONS: { READ_SMS: 'android.permission.READ_SMS' },
  },
}));

jest.mock('@/src/services/analytics-service');

describe('SmsSyncPipeline integration', () => {
  const baseDate = 1_700_000_000_000;
  let cashId: string;
  let expenseId: string;

  beforeEach(async () => {
    mockStorageState.store.clear();
    await resetSmsTestDb();
    ({ cashId, expenseId } = await seedSmsTestAccounts());
    mockAndroidSmsInbox([]);
  }, 15000);

  describe('reference tier', () => {
    it('flags duplicate when reference matches a linked inbox journal', async () => {
      const parsed = await parseFixtureMessage('upiRef121554846690', baseDate);
      const journal = await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'UPI Payment',
        journalDate: baseDate,
      });

      await seedInboxRecord({
        deviceSourceId: 'prior-import',
        referenceNumber: '121554846690',
        linkedJournalId: journal.id,
        parsedAmount: parsed.amount,
        processingStatus: InboxProcessingStatus.IMPORTED,
      });

      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-ref-a1',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-ref-a1');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
      expect(inbox?.duplicateJournalId).toBe(journal.id);
      expect(inbox?.duplicateConfidence).toBe(
        AppConfig.input.sms.duplicateDetection.referenceMatchScore,
      );
    });

    it('flags duplicate via journal metadata reference fallback', async () => {
      const parsed = await parseFixtureMessage('upiRef121554846690', baseDate);
      const journal = await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'Manual SMS import',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
        },
      });

      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-ref-a2',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-ref-a2');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
      expect(inbox?.duplicateJournalId).toBe(journal.id);
    });

    it('stays pending when reference matches but amount differs', async () => {
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: 500,
        description: 'Different amount',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
        },
      });

      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-ref-a3',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-ref-a3');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
      expect(inbox?.duplicateJournalId).toBeFalsy();
    });

    it('prefers reference tier over fuzzy match', async () => {
      const parsed = await parseFixtureMessage('upiRef121554846690', baseDate);
      const refJournal = await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'Ref journal',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
        },
      });
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'SWIGGY order',
        journalDate: baseDate + 5 * 60 * 1000,
      });

      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-ref-a4',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-ref-a4');
      expect(inbox?.duplicateJournalId).toBe(refJournal.id);
    });

    it('skips fuzzy lookup when parsed SMS has a reference number', async () => {
      const findNearbySpy = jest.spyOn(smsJournalQueries, 'findNearbyJournals');
      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-ref-a5',
        date: baseDate,
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      expect(findNearbySpy).not.toHaveBeenCalled();
      findNearbySpy.mockRestore();
    });
  });

  describe('fuzzy tier', () => {
    it('flags close-in-time matches with merchant confirmation', async () => {
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: 500,
        description: 'SWIGGY order',
        journalDate: baseDate,
      });

      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-fuzzy-b1',
        date: baseDate + 15 * 60 * 1000,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-fuzzy-b1');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
      expect(inbox?.duplicateConfidence).toBeGreaterThanOrEqual(
        AppConfig.input.sms.duplicateDetection.scoreThreshold,
      );
    });

    it('stays pending when merchant matches but outside fuzzy window', async () => {
      const fuzzyWindowMs = AppConfig.input.sms.duplicateDetection.fuzzyWindowMs;
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: 500,
        description: 'SWIGGY order',
        journalDate: baseDate,
      });

      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-fuzzy-b2',
        date: baseDate + fuzzyWindowMs + 60 * 1000,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-fuzzy-b2');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    });

    it('stays pending when time is close but merchant does not match', async () => {
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: 500,
        description: 'Grocery run',
        journalDate: baseDate,
      });

      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-fuzzy-b3',
        date: baseDate + 10 * 60 * 1000,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-fuzzy-b3');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    });

    it('does not flag same merchant and amount on a different day', async () => {
      const dayMs = AppConfig.input.sms.duplicateDetection.fingerprintDayBucketMs;
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: 500,
        description: 'SWIGGY order',
        journalDate: baseDate - dayMs,
      });

      const message = smsMessageFromFixture('swiggyRepeatDay2', {
        id: 'sms-fuzzy-b4',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-fuzzy-b4');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    });
  });

  describe('exact identity', () => {
    it('marks SMS as imported when original_sms_id matches', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-exact-c1',
        date: baseDate,
      });
      const parsed = await parseFixtureMessage('swiggyNoRef', baseDate);
      const journal = await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'SWIGGY order',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          originalSmsId: message.id,
        },
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-exact-c1');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
      expect(inbox?.linkedJournalId).toBe(journal.id);
    });

    it('marks SMS as imported when fingerprint matches a linked inbox record', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-exact-c2',
        date: baseDate,
      });
      const parsed = await parseFixtureMessage('swiggyNoRef', baseDate);
      const journal = await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'SWIGGY order',
        journalDate: baseDate,
      });
      const fingerprint = fingerprintForMessage(message);

      await seedInboxRecord({
        deviceSourceId: 'prior-linked-sms',
        inputFingerprint: fingerprint,
        linkedJournalId: journal.id,
        parsedAmount: parsed.amount,
        processingStatus: InboxProcessingStatus.IMPORTED,
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-exact-c2');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
      expect(inbox?.linkedJournalId).toBe(journal.id);
    });

    it('marks SMS as imported when device id is in processed MMKV set', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-exact-c3',
        date: baseDate,
      });
      smsSyncPipeline.markSmsAsProcessed(message.id);

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-exact-c3');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
    });
  });

  describe('re-scan lifecycle', () => {
    it('upgrades PENDING to DUPLICATE_FLAGGED when a matching journal appears', async () => {
      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-rescan-d1',
        date: baseDate,
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);
      const firstPass = await fetchInboxByDeviceId('sms-rescan-d1');
      expect(firstPass?.processingStatus).toBe(InboxProcessingStatus.PENDING);
      const firstSeenAt = firstPass?.firstSeenAt;

      const parsed = await parseFixtureMessage('upiRef121554846690', baseDate);
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'Late import',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
        },
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);
      const secondPass = await fetchInboxByDeviceId('sms-rescan-d1');
      expect(secondPass?.processingStatus).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
      expect(secondPass?.firstSeenAt).toBe(firstSeenAt);
      expect(secondPass?.lastScannedAt).toBeGreaterThanOrEqual(firstSeenAt!);
    });

    it('preserves IMPORTED status on re-scan even when duplicate signal exists', async () => {
      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-rescan-d2',
        date: baseDate,
      });
      const parsed = await parseFixtureMessage('upiRef121554846690', baseDate);
      const journal = await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'Imported UPI',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          originalSmsId: message.id,
        },
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'Another ref match',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
        },
      });

      const inbox = await fetchInboxByDeviceId('sms-rescan-d2');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
      expect(inbox?.linkedJournalId).toBe(journal.id);
    });

    it('keeps DUPLICATE_FLAGGED stable across repeated scans', async () => {
      const parsed = await parseFixtureMessage('upiRef121554846690', baseDate);
      await seedExpenseJournal({
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'Ref journal',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
        },
      });

      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-rescan-d3',
        date: baseDate,
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const records = await fetchInboxByDeviceId('sms-rescan-d3');
      expect(records?.processingStatus).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
    });
  });

  describe('parse edge cases', () => {
    it('does not extract a reference from card-ending SMS bodies', async () => {
      const message = smsMessageFromFixture('cardEndingNegative', {
        id: 'sms-edge-e1',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-edge-e1');
      expect(inbox?.referenceNumber).toBeFalsy();
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    });

    it('marks parse-failed SMS with PARSE_FAILED processing status', async () => {
      const message = smsMessageFromFixture('parseFailedNoAmount', {
        id: 'sms-edge-e2',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-edge-e2');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PARSE_FAILED);
    });

    it('does not create inbox records for personal phone-number senders', async () => {
      const message = smsMessageFromFixture('personalSender', {
        id: 'sms-edge-e3',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-edge-e3');
      expect(inbox).toBeNull();
    });
  });

  describe('workplace isolation', () => {
    it('does not mutate another workplace row with the same device SMS id', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-iso-collision',
        date: baseDate,
      });
      const workplaceARecord = await seedInboxRecord({
        workplaceId: SMS_TEST_WORKPLACE,
        deviceSourceId: message.id,
        rawBody: 'Workplace A original body',
        processingStatus: InboxProcessingStatus.DISMISSED,
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE_B, [message]);

      const unchangedA = await fetchInboxByDeviceId(message.id, SMS_TEST_WORKPLACE);
      const createdB = await fetchInboxByDeviceId(message.id, SMS_TEST_WORKPLACE_B);
      expect(unchangedA?.id).toBe(workplaceARecord.id);
      expect(unchangedA?.rawBody).toBe('Workplace A original body');
      expect(unchangedA?.processingStatus).toBe(InboxProcessingStatus.DISMISSED);
      expect(createdB).not.toBeNull();
      expect(createdB?.id).not.toBe(workplaceARecord.id);
      expect(createdB?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    });

    it('does not flag duplicates across workplaces', async () => {
      await seedSmsTestAccounts(SMS_TEST_WORKPLACE_B);
      const parsed = await parseFixtureMessage('upiRef121554846690', baseDate);
      await seedExpenseJournal({
        workplaceId: SMS_TEST_WORKPLACE,
        cashId,
        expenseId,
        amount: parsed.amount!,
        description: 'Workplace A journal',
        journalDate: baseDate,
        metadata: {
          importSource: 'sms',
          metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
        },
      });

      const message = smsMessageFromFixture('upiRef121554846690', {
        id: 'sms-iso-f1',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE_B, [message]);

      const inbox = await fetchInboxByDeviceId('sms-iso-f1', SMS_TEST_WORKPLACE_B);
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    });
  });
});
