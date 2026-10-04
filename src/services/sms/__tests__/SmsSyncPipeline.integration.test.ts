import { AppConfig } from '@/src/constants';
import { InboxProcessingStatus, JournalStatus } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { database } from '@/src/data/database/Database';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { preferences } from '@/src/services/preferences';
import Journal from '@/src/data/models/Journal';
import AuditLog from '@/src/data/models/AuditLog';
import Transaction from '@/src/data/models/Transaction';
import type TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { Q } from '@nozbe/watermelondb';
import { smsMessageFromFixture } from '@/src/testing/smsFixtures';
import { storage } from '@/src/utils/storage';
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
} from '@/src/testing/smsTestHarness';

jest.mock('@/src/utils/storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => {
        store.set(key, value);
      },
      remove: (key: string) => {
        store.delete(key);
      },
      getBoolean: jest.fn(),
      getNumber: jest.fn(),
      contains: jest.fn((key: string) => store.has(key)),
      getAllKeys: jest.fn(() => Array.from(store.keys())),
      clearAll: jest.fn(() => store.clear()),
    },
    migrateFromAsyncStorage: jest.fn().mockResolvedValue(false),
  };
});

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

jest.mock('@/src/services/analytics');

describe('SmsSyncPipeline integration', () => {
  const baseDate = 1_700_000_000_000;
  let cashId: string;
  let expenseId: string;

  async function inboxStatus(deviceId: string) {
    return (await fetchInboxByDeviceId(deviceId))?.processingStatus;
  }

  async function scanFixture(
    fixture: Parameters<typeof smsMessageFromFixture>[0],
    deviceId: string,
    date: number,
    workplaceId: WorkplaceId = SMS_TEST_WORKPLACE,
  ) {
    await scanSmsInbox(workplaceId, [smsMessageFromFixture(fixture, { id: deviceId, date })]);
    return inboxStatus(deviceId);
  }

  beforeEach(async () => {
    storage.clearAll();
    preferences.device.setSmsAutoPostEnabled(true);
    preferences.device.update({ areSmsReviewNotificationsEnabled: true });
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

      expect(
        await scanFixture('swiggyNoRef', 'sms-fuzzy-b1', baseDate + 15 * 60 * 1000),
      ).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
      const inbox = await fetchInboxByDeviceId('sms-fuzzy-b1');
      expect(inbox?.duplicateConfidence).toBeGreaterThanOrEqual(
        AppConfig.input.sms.duplicateDetection.scoreThreshold,
      );
    });

    it.each([
      {
        id: 'sms-fuzzy-b2',
        journalDescription: 'SWIGGY order',
        fixture: 'swiggyNoRef' as const,
        dateOffsetMs: AppConfig.input.sms.duplicateDetection.fuzzyWindowMs + 60 * 1000,
      },
      {
        id: 'sms-fuzzy-b3',
        journalDescription: 'Grocery run',
        fixture: 'swiggyNoRef' as const,
        dateOffsetMs: 10 * 60 * 1000,
      },
      {
        id: 'sms-fuzzy-b4',
        journalDescription: 'SWIGGY order',
        fixture: 'swiggyRepeatDay2' as const,
        dateOffsetMs: 0,
        journalDateOffsetMs: AppConfig.input.sms.duplicateDetection.fingerprintDayBucketMs,
      },
    ])(
      'stays pending for $id',
      async ({ id, journalDescription, fixture, dateOffsetMs, journalDateOffsetMs = 0 }) => {
        await seedExpenseJournal({
          cashId,
          expenseId,
          amount: 500,
          description: journalDescription,
          journalDate: baseDate - journalDateOffsetMs,
        });
        expect(await scanFixture(fixture, id, baseDate + dateOffsetMs)).toBe(
          InboxProcessingStatus.PENDING,
        );
      },
    );
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
        inputDate: baseDate - 3000,
        linkedJournalId: journal.id,
        parsedAmount: parsed.amount,
        processingStatus: InboxProcessingStatus.IMPORTED,
      });

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-exact-c2');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
      expect(inbox?.linkedJournalId).toBe(journal.id);
    });

    it('does not use legacy processed IDs as a cross-workplace source of truth', async () => {
      await seedSmsTestAccounts(SMS_TEST_WORKPLACE_B);
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-exact-c3',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE_B, [message]);

      const inbox = await fetchInboxByDeviceId('sms-exact-c3', SMS_TEST_WORKPLACE_B);
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
    });
  });

  describe('auto-post persistence boundary', () => {
    async function enableAutoPostFor(message: ReturnType<typeof smsMessageFromFixture>) {
      await transactionAutoPostRuleRepository.save(
        {
          mode: 'regex',
          senderMatch: message.address,
          actions: {
            disposition: 'auto_post',
            sourceAccountId: cashId as AccountId,
            categoryAccountId: expenseId as AccountId,
          },
          isActive: true,
        },
        SMS_TEST_WORKPLACE,
      );
    }

    it('leaves matching entries pending when the SMS auto-post master switch is off', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'auto-post-master-off',
        date: baseDate,
      });
      await enableAutoPostFor(message);
      preferences.device.setSmsAutoPostEnabled(false);

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      expect((await fetchInboxByDeviceId(message.id))?.processingStatus).toBe(
        InboxProcessingStatus.PENDING,
      );
      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(0);
    });

    it('auto-posts duplicate reference candidates only once within a scan', async () => {
      const first = smsMessageFromFixture('upiRef121554846690', {
        id: 'ref-duplicate-a',
        date: baseDate,
      });
      const second = smsMessageFromFixture('upiRef121554846690', {
        id: 'ref-duplicate-b',
        date: baseDate + 1000,
      });
      await enableAutoPostFor(first);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [first, second]);

      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(1);
      expect((await fetchInboxByDeviceId(first.id))?.processingStatus).toBe(
        InboxProcessingStatus.AUTO_POSTED,
      );
      expect((await fetchInboxByDeviceId(second.id))?.id).toBe(
        (await fetchInboxByDeviceId(first.id))?.id,
      );
    });

    it('reserves exact no-reference content within a scan and correlates the accepted audit group once', async () => {
      const first = smsMessageFromFixture('swiggyNoRef', {
        id: 'content-duplicate-a',
        date: baseDate,
      });
      const second = smsMessageFromFixture('swiggyNoRef', {
        id: 'content-duplicate-b',
        date: baseDate,
      });
      await enableAutoPostFor(first);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [first, second]);

      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(1);
      expect((await fetchInboxByDeviceId(second.id))?.id).toBe(
        (await fetchInboxByDeviceId(first.id))?.id,
      );
      const journal = (
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetch()
      )[0];
      const auditCollection = database.collections.get<AuditLog>('audit_logs');
      const journalLogs = await auditCollection
        .query(
          Q.where('workplace_id', SMS_TEST_WORKPLACE),
          Q.where('entity_id', journal.id),
          Q.where('event_type', 'journal.sms_auto_posted'),
        )
        .fetch();
      expect(journalLogs).toHaveLength(1);
      const logs = await auditCollection
        .query(
          Q.where('workplace_id', SMS_TEST_WORKPLACE),
          Q.where('correlation_id', journalLogs[0].correlationId),
        )
        .fetch();
      expect(logs.filter(log => log.eventType === 'journal.sms_auto_posted')).toHaveLength(1);
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it('flags a repeated no-reference SMS delivered seconds apart within one scan', async () => {
      const first = smsMessageFromFixture('swiggyNoRef', {
        id: 'content-redelivered-a',
        date: baseDate,
      });
      const second = smsMessageFromFixture('swiggyNoRef', {
        id: 'content-redelivered-b',
        date: baseDate + 4000,
      });
      await enableAutoPostFor(first);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [first, second]);

      const journals = await database.collections
        .get<Journal>('journals')
        .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
        .fetch();
      expect(journals).toHaveLength(1);
      expect((await fetchInboxByDeviceId(first.id))?.processingStatus).toBe(
        InboxProcessingStatus.AUTO_POSTED,
      );
      const flagged = await fetchInboxByDeviceId(second.id);
      expect(flagged?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
      expect(flagged?.id).toBe((await fetchInboxByDeviceId(first.id))?.id);
      expect(flagged?.linkedJournalId).toBe(journals[0].id);
      expect(flagged?.rawBody).toBe(first.body);
    });

    it('auto-posts distinct long messages sharing the legacy fingerprint prefix', async () => {
      const prefix = 'Account transaction notification '.repeat(8);
      const messages = [
        smsMessageFromFixture('upiRef121554846690', {
          id: 'long-content-a',
          date: baseDate,
          body: `${prefix}INR 250.00 debited (UPI Ref No 121554846690) on 07-Mar.`,
        }),
        smsMessageFromFixture('upiRef121554846690', {
          id: 'long-content-b',
          date: baseDate + 4000,
          body: `${prefix}INR 900.00 debited (UPI Ref No 121554846691) on 07-Mar.`,
        }),
      ];
      expect(fingerprintForMessage(messages[0])).toBe(fingerprintForMessage(messages[1]));
      await enableAutoPostFor(messages[0]);
      await scanSmsInbox(SMS_TEST_WORKPLACE, messages);

      const records = await Promise.all(messages.map(message => fetchInboxByDeviceId(message.id)));
      expect(records.map(record => record?.parsedAmount)).toEqual([250, 900]);
      expect(records.map(record => record?.referenceNumber)).toEqual([
        '121554846690',
        '121554846691',
      ]);
      expect(records.map(record => record?.processingStatus)).toEqual([
        InboxProcessingStatus.AUTO_POSTED,
        InboxProcessingStatus.AUTO_POSTED,
      ]);
      expect(records[0]?.linkedJournalId).toBeTruthy();
      expect(records[1]?.linkedJournalId).toBeTruthy();
      expect(records[1]?.linkedJournalId).not.toBe(records[0]?.linkedJournalId);
      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(2);
    });

    it('auto-posts identical no-reference templates hours apart on the same day', async () => {
      const dayStart = Math.floor(baseDate / AppConfig.time.msPerDay) * AppConfig.time.msPerDay;
      const first = smsMessageFromFixture('swiggyNoRef', {
        id: 'same-template-morning',
        date: dayStart + 9 * 60 * 60 * 1000,
      });
      const second = {
        ...first,
        id: 'same-template-afternoon',
        date: first.date + 6 * 60 * 60 * 1000,
      };
      expect(fingerprintForMessage(first)).toBe(fingerprintForMessage(second));
      await enableAutoPostFor(first);
      // Native inboxes commonly return newest-first; the distance check must be symmetric.
      await scanSmsInbox(SMS_TEST_WORKPLACE, [second, first]);

      const records = await Promise.all(
        [first, second].map(message => fetchInboxByDeviceId(message.id)),
      );
      expect(records.map(record => record?.processingStatus)).toEqual([
        InboxProcessingStatus.AUTO_POSTED,
        InboxProcessingStatus.AUTO_POSTED,
      ]);
      expect(records[1]?.linkedJournalId).not.toBe(records[0]?.linkedJournalId);
      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(2);
    });

    it.each([false, true])(
      'flags redelivery across midnight with newest-first=%s',
      async newestFirst => {
        const dayStart = Math.floor(baseDate / AppConfig.time.msPerDay) * AppConfig.time.msPerDay;
        const older = smsMessageFromFixture('swiggyNoRef', {
          id: 'midnight-older',
          date: dayStart + AppConfig.time.msPerDay - 2000,
        });
        const newer = { ...older, id: 'midnight-newer', date: older.date + 4000 };
        expect(fingerprintForMessage(older)).not.toBe(fingerprintForMessage(newer));
        await enableAutoPostFor(older);
        const messages = newestFirst ? [newer, older] : [older, newer];
        await scanSmsInbox(SMS_TEST_WORKPLACE, messages);

        const posted = await fetchInboxByDeviceId(messages[0].id);
        const duplicate = await fetchInboxByDeviceId(messages[1].id);
        expect(posted?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
        expect(duplicate?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
        expect(duplicate?.id).toBe(posted?.id);
        expect(duplicate?.linkedJournalId).toBe(posted?.linkedJournalId);
        expect(duplicate?.rawBody).toBe(older.body);
        expect(
          await database.collections
            .get<Journal>('journals')
            .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
            .fetchCount(),
        ).toBe(1);
      },
    );

    it('retains earlier content claims when scan timestamps are out of order', async () => {
      const dayStart = Math.floor(baseDate / AppConfig.time.msPerDay) * AppConfig.time.msPerDay;
      const first = smsMessageFromFixture('swiggyNoRef', {
        id: 'content-claim-first',
        date: dayStart + 9 * 60 * 60 * 1000,
      });
      const later = { ...first, id: 'content-claim-later', date: first.date + 6 * 60 * 60 * 1000 };
      const redelivery = { ...first, id: 'content-claim-redelivery', date: first.date + 4000 };
      await enableAutoPostFor(first);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [first, later, redelivery]);

      const records = await Promise.all(
        [first, later, redelivery].map(message => fetchInboxByDeviceId(message.id)),
      );
      expect(records.map(record => record?.processingStatus)).toEqual([
        InboxProcessingStatus.AUTO_POSTED,
        InboxProcessingStatus.AUTO_POSTED,
        InboxProcessingStatus.AUTO_POSTED,
      ]);
      expect(records[2]?.id).toBe(records[0]?.id);
      expect(records[2]?.linkedJournalId).toBe(records[0]?.linkedJournalId);
      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(2);
    });

    describe('across separate scans', () => {
      const journalCount = () =>
        database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount();

      it('links a redelivery seconds later to the earlier journal', async () => {
        const first = smsMessageFromFixture('swiggyNoRef', {
          id: 'cross-redeliver-a',
          date: baseDate,
        });
        const redelivery = { ...first, id: 'cross-redeliver-b', date: baseDate + 4000 };
        await enableAutoPostFor(first);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [first]);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [redelivery]);

        const [original, repeated] = await Promise.all(
          [first, redelivery].map(message => fetchInboxByDeviceId(message.id)),
        );
        expect(repeated?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
        expect(repeated?.linkedJournalId).toBe(original?.linkedJournalId);
        expect(await journalCount()).toBe(1);
      });

      it('links a redelivery that crosses midnight', async () => {
        const dayStart = Math.floor(baseDate / AppConfig.time.msPerDay) * AppConfig.time.msPerDay;
        const older = smsMessageFromFixture('swiggyNoRef', {
          id: 'cross-midnight-older',
          date: dayStart + AppConfig.time.msPerDay - 2000,
        });
        const newer = { ...older, id: 'cross-midnight-newer', date: older.date + 4000 };
        expect(fingerprintForMessage(older)).not.toBe(fingerprintForMessage(newer));
        await enableAutoPostFor(older);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [older]);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [newer]);

        const repeated = await fetchInboxByDeviceId(newer.id);
        expect(repeated?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
        expect(repeated?.linkedJournalId).toBe(
          (await fetchInboxByDeviceId(older.id))?.linkedJournalId,
        );
        expect(await journalCount()).toBe(1);
      });

      it('auto-posts an identical template hours later on the same day', async () => {
        const dayStart = Math.floor(baseDate / AppConfig.time.msPerDay) * AppConfig.time.msPerDay;
        const morning = smsMessageFromFixture('swiggyNoRef', {
          id: 'cross-template-morning',
          date: dayStart + 9 * 60 * 60 * 1000,
        });
        const afternoon = {
          ...morning,
          id: 'cross-template-afternoon',
          date: morning.date + 6 * 60 * 60 * 1000,
        };
        expect(fingerprintForMessage(morning)).toBe(fingerprintForMessage(afternoon));
        await enableAutoPostFor(morning);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [morning]);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [afternoon]);

        const [first, second] = await Promise.all(
          [morning, afternoon].map(message => fetchInboxByDeviceId(message.id)),
        );
        expect(second?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
        expect(second?.linkedJournalId).not.toBe(first?.linkedJournalId);
        expect(await journalCount()).toBe(2);
      });

      it('auto-posts a distinct debit sharing the legacy fingerprint prefix', async () => {
        const prefix = 'Account transaction notification '.repeat(8);
        const small = smsMessageFromFixture('upiRef121554846690', {
          id: 'cross-long-a',
          date: baseDate,
          body: `${prefix}INR 250.00 debited (UPI Ref No 121554846690) on 07-Mar.`,
        });
        const large = smsMessageFromFixture('upiRef121554846690', {
          id: 'cross-long-b',
          date: baseDate + 4000,
          body: `${prefix}INR 900.00 debited (UPI Ref No 121554846691) on 07-Mar.`,
        });
        expect(fingerprintForMessage(small)).toBe(fingerprintForMessage(large));
        await enableAutoPostFor(small);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [small]);
        await scanSmsInbox(SMS_TEST_WORKPLACE, [large]);

        const [first, second] = await Promise.all(
          [small, large].map(message => fetchInboxByDeviceId(message.id)),
        );
        expect(second?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
        expect(second?.parsedAmount).toBe(900);
        expect(second?.linkedJournalId).not.toBe(first?.linkedJournalId);
        expect(await journalCount()).toBe(2);
      });
    });

    it('stages only one inbox record when a device message ID is repeated in a scan', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'same-device-id',
        date: baseDate,
      });
      await enableAutoPostFor(message);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message, message]);
      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(1);
      expect(
        await database.collections
          .get('transaction_inbox_records')
          .query(Q.where('device_source_id', message.id))
          .fetchCount(),
      ).toBe(1);
    });

    it('does not collapse the same reference when parsed amounts differ', async () => {
      const first = smsMessageFromFixture('upiRef121554846690', {
        id: 'ref-amount-a',
        date: baseDate,
      });
      const second = smsMessageFromFixture('upiRef121554846690', {
        id: 'ref-amount-b',
        date: baseDate + 1000,
        body: 'INR 500.00 debited (UPI Ref No 121554846690) on 07-Mar.',
      });
      await enableAutoPostFor(first);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [first, second]);

      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(2);
      expect((await fetchInboxByDeviceId(second.id))?.processingStatus).toBe(
        InboxProcessingStatus.AUTO_POSTED,
      );
    });

    it('retains earlier reference claims when another amount reuses the reference', async () => {
      const messages = [100, 200, 100].map((amount, index) =>
        smsMessageFromFixture('upiRef121554846690', {
          id: `ref-reused-${index}`,
          date: baseDate + index * 1000,
          body: `INR ${amount}.00 debited (UPI Ref No 121554846690) on 07-Mar.`,
        }),
      );
      await enableAutoPostFor(messages[0]);
      await scanSmsInbox(SMS_TEST_WORKPLACE, messages);

      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(2);
      const records = await Promise.all(messages.map(message => fetchInboxByDeviceId(message.id)));
      expect(records.map(record => record?.processingStatus)).toEqual([
        InboxProcessingStatus.AUTO_POSTED,
        InboxProcessingStatus.AUTO_POSTED,
        InboxProcessingStatus.AUTO_POSTED,
      ]);
      expect(records[2]?.id).toBe(records[0]?.id);
    });

    it('keeps same-amount transactions with distinct references in the same scan', async () => {
      const first = smsMessageFromFixture('upiRef121554846690', {
        id: 'ref-distinct-a',
        date: baseDate,
      });
      const second = smsMessageFromFixture('upiRef121554846690', {
        id: 'ref-distinct-b',
        date: baseDate + 1000,
        body: 'INR 250.00 debited (UPI Ref No 121554846691) on 07-Mar.',
      });
      await enableAutoPostFor(first);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [first, second]);

      expect(
        await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', SMS_TEST_WORKPLACE))
          .fetchCount(),
      ).toBe(2);
      expect((await fetchInboxByDeviceId(second.id))?.processingStatus).toBe(
        InboxProcessingStatus.AUTO_POSTED,
      );
    });

    it('posts through the accounting repository and stays idempotent on a repeated scan', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-auto-post-1',
        date: baseDate,
      });
      await transactionAutoPostRuleRepository.save(
        {
          mode: 'regex',
          senderMatch: message.address,
          actions: {
            disposition: 'auto_post',
            sourceAccountId: cashId as AccountId,
            categoryAccountId: expenseId as AccountId,
          },
          isActive: true,
        },
        SMS_TEST_WORKPLACE,
      );

      await expect(scanSmsInbox(SMS_TEST_WORKPLACE, [message])).resolves.toBe(1);
      const inbox = await fetchInboxByDeviceId(message.id);
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
      expect(inbox?.linkedJournalId).toBeTruthy();
      expect(inbox?.rawBody).toBe(message.body);
      expect(inbox?.senderAddress).toBe(message.address);
      const journal = await database.collections
        .get<Journal>('journals')
        .find(inbox!.linkedJournalId!);
      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(
        await database.collections
          .get<Transaction>('transactions')
          .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
          .fetchCount(),
      ).toBe(2);

      await expect(scanSmsInbox(SMS_TEST_WORKPLACE, [message])).resolves.toBe(0);
      const rescannedInbox = await fetchInboxByDeviceId(message.id);
      expect(rescannedInbox?.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
      expect(rescannedInbox?.rawBody).toBe(message.body);
      expect(rescannedInbox?.senderAddress).toBe(message.address);
      expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(1);
    });

    it('leaves inbox pending and creates no journal when persistence validation fails', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-auto-post-missing-account',
        date: baseDate,
      });
      await transactionAutoPostRuleRepository.save(
        {
          mode: 'regex',
          senderMatch: message.address,
          actions: {
            disposition: 'auto_post',
            sourceAccountId: 'missing-account' as AccountId,
            categoryAccountId: expenseId as AccountId,
          },
          isActive: true,
        },
        SMS_TEST_WORKPLACE,
      );

      await expect(scanSmsInbox(SMS_TEST_WORKPLACE, [message])).resolves.toBe(0);
      expect((await fetchInboxByDeviceId(message.id))?.processingStatus).toBe(
        InboxProcessingStatus.PENDING,
      );
      expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(0);
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

    it('keeps raw SMS on a dismissed record across re-scans so it can be restored', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-rescan-dismissed',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);
      const pending = await fetchInboxByDeviceId(message.id);
      await transactionInboxRepository.persistStatus(
        SMS_TEST_WORKPLACE,
        pending!.id,
        InboxProcessingStatus.DISMISSED,
      );

      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const dismissed = await fetchInboxByDeviceId(message.id);
      expect(dismissed?.processingStatus).toBe(InboxProcessingStatus.DISMISSED);
      expect(dismissed?.senderAddress).toBe(message.address);
      expect(dismissed?.rawBody).toBe(message.body);
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

    it('retains the Device source for a financial SMS dismissed by an ignore rule', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-edge-ignored',
        date: baseDate,
      });
      await transactionAutoPostRuleRepository.save(
        {
          mode: 'regex',
          senderMatch: message.address,
          actions: { disposition: 'ignore' },
          isActive: true,
        },
        SMS_TEST_WORKPLACE,
      );
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-edge-ignored');
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.DISMISSED);
      expect(inbox?.senderAddress).toBe(message.address);
      expect(inbox?.rawBody).toBe(message.body);
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

    it('parses transaction SMS from numeric sender addresses', async () => {
      const message = smsMessageFromFixture('swiggyNoRef', {
        id: 'sms-edge-e4',
        address: '+16505551212',
        body: 'Debited Rs 80.00 from a/c X0144 via UPI to PRAVEEN KUMA. Ref 623763721919.',
        date: baseDate,
      });
      await scanSmsInbox(SMS_TEST_WORKPLACE, [message]);

      const inbox = await fetchInboxByDeviceId('sms-edge-e4');
      expect(inbox?.parsedAmount).toBe(80);
      expect(inbox?.processingStatus).toBe(InboxProcessingStatus.PENDING);
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
      expect(unchangedA?.id).toBe(createdB?.id);
      expect(
        (
          await database
            .get<TransactionInboxRecord>('transaction_inbox_records')
            .find(workplaceARecord.id)
        ).rawBody,
      ).toBe('Workplace A original body');
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
