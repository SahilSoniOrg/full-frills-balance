import { firstValueFrom } from 'rxjs';
import { database } from '@/src/data/database/Database';
import DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { deviceSmsInboxRepository } from '@/src/data/repositories/DeviceSmsInboxRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { notificationService } from '@/src/services/notification/NotificationService';
import { preferences } from '@/src/services/preferences';
import { SmsReviewNotificationService } from '../SmsReviewNotificationService';
import { smsSyncPipeline } from '../pipeline';
import { smsService } from '@/src/services/sms-service';
import { smsPrivacyService } from '../SmsPrivacyService';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { mapSmsJournalMetadataDisplay } from '@/src/services/journal/journalDetailsHelpers';
import { InboxProcessingStatus } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { smsMessageFromFixture } from '@/src/testing/smsFixtures';
import {
  resetSmsTestDb,
  seedSmsTestAccounts,
  seedExpenseJournal,
  SMS_TEST_WORKPLACE as A,
  SMS_TEST_WORKPLACE_B as B,
} from '@/src/testing/smsTestHarness';

jest.mock('@/src/services/analytics');
jest.mock('@/src/services/notification/NotificationService', () => {
  let reviewVisible = false;
  let reviewRecordId: string | undefined;
  return {
    SMS_REVIEW_NOTIFICATION_TYPE: 'sms_transaction_needs_review',
    notificationService: {
      reconcileSmsReviews: jest.fn().mockResolvedValue(undefined),
      canDeliverSmsReview: jest.fn().mockResolvedValue(true),
      deliverSmsReview: jest.fn().mockResolvedValue(true),
      setSmsReviewVisible: jest.fn((visible: boolean, recordId?: string) => {
        reviewVisible = visible;
        reviewRecordId = recordId;
      }),
      isSmsReviewForegroundSuppressed: jest.fn((recordId?: string) =>
        reviewVisible || (recordId !== undefined && reviewRecordId === recordId),
      ),
      __resetReviewVisibility: () => {
        reviewVisible = false;
        reviewRecordId = undefined;
      },
    },
  };
});
const deliver = jest.mocked(notificationService.deliverSmsReview);
const message = (id = 'one', offset = 0) =>
  smsMessageFromFixture('swiggyNoRef', { id, date: 1_700_000_000_000 + offset });
let service: SmsReviewNotificationService;
beforeEach(async () => {
  await resetSmsTestDb();
  service = new SmsReviewNotificationService();
  (notificationService as { __resetReviewVisibility?: () => void }).__resetReviewVisibility?.();
  deliver.mockReset().mockResolvedValue(true);
  jest.mocked(notificationService.canDeliverSmsReview).mockResolvedValue(true);
  preferences.device.update({
    areSmsReviewNotificationsEnabled: true,
    showSmsNotificationDetails: false,
  });
  preferences.update({ isPrivacyMode: false });
  preferences.device.setSmsAutoPostEnabled(false);
  preferences.device.setAppLockEnabled(false);
  jest.spyOn(preferences, 'loadPreferences').mockResolvedValue(preferences.getSnapshot());
});
afterEach(() => jest.restoreAllMocks());
const capture = (id = 'one', origin: 'arrival' | 'catch_up' | 'initial' | 'manual' = 'arrival') =>
  smsSyncPipeline.scanMessages(A, [message(id)], undefined, { origin });

it.each([InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED] as const)(
  'retains the source for journal details and explicit backups after %s and privacy maintenance',
  async disposition => {
    await capture();
    const [source] = await transactionInboxRepository.findByDeviceSourceIds(A, ['one']);
    const { cashId, expenseId } = await seedSmsTestAccounts(A);
    const journal = await seedExpenseJournal({
      cashId,
      expenseId,
      amount: 500,
      description: 'Lunch',
      journalDate: message().date,
    });
    await transactionInboxRepository.persistLink(A, source.id, journal.id, disposition);
    await smsPrivacyService.cleanupLegacyContent(true);
    const [linked] = await smsService.findAllByLinkedJournalId(A, journal.id);
    expect(mapSmsJournalMetadataDisplay({ inboxRecord: linked })).toMatchObject({
      sender: message().address,
      rawBody: message().body,
      inboxRecordId: source.id,
    });
    const [copy] = await database
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .query()
      .fetch();
    expect(copy.rawBody).toBeFalsy();
    expect(copy.senderAddress).toBeFalsy();
    const columns = [
      'id',
      'channel',
      'device_source_id',
      'sender_address',
      'raw_body',
      'workplace_id',
    ];
    expect(await exportRepository.fetchOrmTable('transaction_inbox_records', columns, A)).toEqual([
      expect.objectContaining({ senderAddress: message().address, rawBody: message().body }),
    ]);
    expect(await exportRepository.fetchOrmTable('transaction_inbox_records', columns, B)).toEqual(
      [],
    );
    await service.flush();
    expect(deliver).not.toHaveBeenCalled();
  },
);

it.each(['manual', 'initial'] as const)('keeps %s history silent', async origin => {
  await capture('one', origin);
  await service.flush();
  expect(deliver).not.toHaveBeenCalled();
  expect(await deviceSmsInboxRepository.pendingNotifications()).toHaveLength(0);
});

it('suppresses captured reviews when notifications are disabled on this device', async () => {
  await capture();
  preferences.device.update({ areSmsReviewNotificationsEnabled: false });

  await service.flush();

  expect(deliver).not.toHaveBeenCalled();
  const callback = jest.mocked(notificationService.reconcileSmsReviews).mock.calls.at(-1)![0];
  await expect(
    callback({ type: 'sms_transaction_needs_review', inboxRecordId: 'one' }, 'sms-review:one'),
  ).resolves.toBe(false);
});

it('removes unsafe previews before startup gates open without delivering pending work', async () => {
  await capture();
  preferences.device.update({ showSmsNotificationDetails: true });
  preferences.device.setAppLockEnabled(true);
  await service.reconcilePrivacy();
  const callback = jest.mocked(notificationService.reconcileSmsReviews).mock.calls.at(-1)![0];
  const intent = { type: 'sms_transaction_needs_review' as const, inboxRecordId: 'one' };
  expect(await callback({ ...intent, hasDetails: true }, 'alert')).toBe(false);
  expect(await callback({ ...intent, hasDetails: false }, 'alert')).toBe(true);
  expect(await callback({ ...intent, inboxRecordId: '' }, 'legacy')).toBe(false);
  expect(deliver).not.toHaveBeenCalled();
  expect(await deviceSmsInboxRepository.pendingNotifications()).toHaveLength(1);
});

it('persists failed delivery and retries with the same OS identity without rescanning or creating a journal', async () => {
  await capture();
  deliver.mockRejectedValueOnce(new Error('OS temporarily unavailable'));
  await expect(service.flush()).rejects.toThrow('OS temporarily unavailable');
  expect(await deviceSmsInboxRepository.pendingNotifications()).toHaveLength(1);
  await service.flush();
  expect(deliver).toHaveBeenCalledTimes(2);
  expect(deliver.mock.calls[0][0]).toBe(deliver.mock.calls[1][0]);
  expect(await deviceSmsInboxRepository.pendingNotifications()).toHaveLength(0);
  expect(
    await database.get<TransactionInboxRecord>('transaction_inbox_records').query().fetchCount(),
  ).toBe(0);
});

it('keeps an outbox item pending while OS notifications are blocked, then delivers after access returns', async () => {
  await capture();
  jest.mocked(notificationService.canDeliverSmsReview).mockResolvedValue(false);
  await service.flush();
  expect(await deviceSmsInboxRepository.pendingNotifications()).toHaveLength(1);
  jest.mocked(notificationService.canDeliverSmsReview).mockResolvedValue(true);
  await service.flush();
  expect(deliver).toHaveBeenCalledTimes(1);
});

it('coalesces redeliveries without collapsing separate purchases outside the delivery window', async () => {
  await smsSyncPipeline.scanMessages(
    A,
    [message('one'), message('again', 1000), message('later', 6 * 60 * 60 * 1000)],
    undefined,
    { origin: 'arrival' },
  );
  expect(
    await database.get<DeviceSmsInboxRecord>('device_sms_inbox_records').query().fetchCount(),
  ).toBe(2);
  expect(await transactionInboxRepository.findByDeviceSourceIds(A, ['one', 'again'])).toHaveLength(
    1,
  );
  await service.flush();
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(deliver.mock.calls[0][1]).toContain('2 SMS transactions');
});

it('groups a catch-up batch and places only opaque review identities in its payload', async () => {
  await smsSyncPipeline.scanMessages(
    A,
    [message('one'), message('later', 6 * 60 * 60 * 1000)],
    undefined,
    { origin: 'catch_up' },
  );
  await service.flush();
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(deliver.mock.calls[0][2]).toEqual(
    expect.objectContaining({ workplaceId: A, grouped: true, hasDetails: false }),
  );
  expect(deliver.mock.calls[0][2]).not.toHaveProperty('amount');
});

it.each(['default', 'privacy', 'lock'] as const)(
  'uses a generic preview under %s protection',
  async protection => {
    preferences.device.update({ showSmsNotificationDetails: protection !== 'default' });
    preferences.update({ isPrivacyMode: protection === 'privacy' });
    preferences.device.setAppLockEnabled(protection === 'lock');
    await capture();
    await service.flush();
    expect(deliver.mock.calls[0][1]).toBe(
      'A transaction message needs your review. Open the app to log it.',
    );
    expect(deliver.mock.calls[0][2].hasDetails).toBe(false);
  },
);

it('does not alert again while the inbox or that SMS composer is visible', async () => {
  await capture();
  const [record] = await deviceSmsInboxRepository.pendingNotifications();
  service.setReviewVisible(false, record.id);
  await service.flush();
  expect(deliver).not.toHaveBeenCalled();
  expect((await deviceSmsInboxRepository.find(record.id))?.notificationState).toBe('suppressed');
});

it('shares pending SMS across workplaces and creates a copy only when consumed', async () => {
  await capture();
  const recordsB = await firstValueFrom(transactionInboxRepository.observeInbox(B, 25));
  const recordsA = await transactionInboxRepository.findByDeviceSourceIds(A, ['one']);
  expect(recordsB[0].id).toBe(recordsA[0].id);
  expect(
    await database.get<TransactionInboxRecord>('transaction_inbox_records').query().fetchCount(),
  ).toBe(0);
  const { cashId, expenseId } = await seedSmsTestAccounts(A);
  const journal = await seedExpenseJournal({
    cashId,
    expenseId,
    amount: 500,
    description: 'Lunch',
    journalDate: message().date,
  });
  await transactionInboxRepository.persistLink(
    A,
    recordsA[0].id,
    journal.id,
    InboxProcessingStatus.IMPORTED,
  );
  const updatedB = await firstValueFrom(transactionInboxRepository.observeInbox(B, 25));
  expect(updatedB[0].processingStatus).toBe(InboxProcessingStatus.PENDING);
  expect(updatedB[0].consumedWorkplaces?.map(workplace => workplace.workplaceId)).toEqual([A]);
  expect(updatedB[0].rawBody).toBe(message().body);
  await service.flush();
  expect(deliver).not.toHaveBeenCalled();
});

it('preserves the first matching rule and account suggestions when auto-post is disabled', async () => {
  const { cashId, expenseId } = await seedSmsTestAccounts(A);
  await transactionAutoPostRuleRepository.save(
    {
      mode: 'regex',
      senderMatch: message().address,
      isActive: true,
      actions: {
        disposition: 'auto_post',
        sourceAccountId: cashId as AccountId,
        categoryAccountId: expenseId as AccountId,
      },
    },
    A,
  );
  preferences.device.update({ showSmsNotificationDetails: true });
  await capture();
  await service.flush();
  const [record] = await transactionInboxRepository.findByDeviceSourceIds(A, ['one']);
  expect(record.processingStatus).toBe(InboxProcessingStatus.PENDING);
  expect(deliver.mock.calls[0][1]).toContain('Cash');
  expect(deliver.mock.calls[0][1]).toContain('Food');
});

it('keeps the Device message reviewable in another workplace after an ignore rule', async () => {
  await transactionAutoPostRuleRepository.save(
    {
      mode: 'regex',
      senderMatch: message().address,
      isActive: true,
      actions: { disposition: 'ignore' },
    },
    A,
  );
  await capture();
  const inA = await transactionInboxRepository.findByDeviceSourceIds(A, ['one']);
  const inB = await transactionInboxRepository.findByDeviceSourceIds(B, ['one']);
  expect(inA[0].processingStatus).toBe(InboxProcessingStatus.DISMISSED);
  expect(inA[0].rawBody).toBe(message().body);
  expect(inB[0].processingStatus).toBe(InboxProcessingStatus.PENDING);
  expect(inB[0].rawBody).toBe(message().body);
});

it('requires manual review in B when the same Device message was already posted in A', async () => {
  const accountsA = await seedSmsTestAccounts(A);
  const accountsB = await seedSmsTestAccounts(B);
  await capture();
  const [record] = await transactionInboxRepository.findByDeviceSourceIds(A, ['one']);
  const journal = await seedExpenseJournal({
    ...accountsA,
    amount: 500,
    description: 'Lunch',
    journalDate: message().date,
  });
  await transactionInboxRepository.persistLink(
    A,
    record.id,
    journal.id,
    InboxProcessingStatus.IMPORTED,
  );
  await transactionAutoPostRuleRepository.save(
    {
      mode: 'regex',
      senderMatch: message().address,
      isActive: true,
      actions: {
        disposition: 'auto_post',
        sourceAccountId: accountsB.cashId as AccountId,
        categoryAccountId: accountsB.expenseId as AccountId,
      },
    },
    B,
  );
  preferences.device.setSmsAutoPostEnabled(true);
  expect(await smsSyncPipeline.scanMessages(B, [message()])).toBe(0);
  const [reviewB] = await transactionInboxRepository.findByDeviceSourceIds(B, ['one']);
  expect(reviewB.processingStatus).toBe(InboxProcessingStatus.PENDING);
  expect(reviewB.consumedWorkplaces?.map(workplace => workplace.workplaceId)).toEqual([A]);
});
