import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { preferences } from '@/src/services/preferences';
import { journalService } from '@/src/services/journal/journalDomainService';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { toPlainAccount } from '@/src/data/models/Account';
import { AccountId } from '@/src/types/ids';
import { smsMessageFromFixture } from '@/src/testing/smsFixtures';
import {
  resetSmsTestDb,
  seedSmsTestAccounts,
  SMS_TEST_WORKPLACE as workplaceId,
  SMS_TEST_WORKPLACE_B,
} from '@/src/testing/smsTestHarness';
import { smsSyncPipeline } from '../pipeline/smsSyncPipeline';
import { SmsNotificationActionService } from '../SmsNotificationActionService';
import type { PendingSmsNotificationIntent } from '../SmsNotificationIntentStore';
import {
  canQuickLogSms,
  smsReviewRevision,
  SMS_LOG_ACTION,
  SMS_IGNORE_ACTION,
} from '../smsNotificationActions';

jest.mock('@/src/services/analytics');

let service: SmsNotificationActionService;
let intent: PendingSmsNotificationIntent;
let sourceId: AccountId;

beforeEach(async () => {
  await resetSmsTestDb();
  preferences.update({ isPrivacyMode: false });
  preferences.device.update({ showSmsNotificationDetails: true });
  preferences.device.setAppLockEnabled(false);
  preferences.device.setSmsAutoPostEnabled(false);
  const { cashId, expenseId } = await seedSmsTestAccounts(workplaceId);
  sourceId = cashId as AccountId;
  const message = smsMessageFromFixture('swiggyNoRef', {
    id: 'notification-sms',
    date: 1_700_000_000_000,
  });
  await transactionAutoPostRuleRepository.save(
    {
      mode: 'regex',
      senderMatch: message.address,
      isActive: true,
      actions: {
        disposition: 'review',
        sourceAccountId: sourceId,
        categoryAccountId: expenseId as AccountId,
      },
    },
    workplaceId,
  );
  await smsSyncPipeline.scanMessages(workplaceId, [message]);
  const [record] = await transactionInboxRepository.findByDeviceSourceIds(workplaceId, [
    message.id,
  ]);
  const accounts = await accountQueryRepository.findAllByIds(workplaceId, [
    sourceId,
    expenseId as AccountId,
  ]);
  expect(canQuickLogSms(record, accounts)).toBe(true);
  intent = {
    responseId: 'response',
    receivedAt: Date.now(),
    inboxRecordId: record.id,
    workplaceId,
    grouped: false,
    actionIdentifier: SMS_LOG_ACTION,
    reviewRevision: smsReviewRevision(record, accounts),
  };
  service = new SmsNotificationActionService();
});

afterEach(() => jest.restoreAllMocks());

it('atomically logs and links once even for repeated concurrent responses', async () => {
  const result = await Promise.all([
    service.execute(intent, workplaceId, () => true),
    service.execute(intent, workplaceId, () => true),
  ]);
  expect(result).toEqual(['logged', 'handled']);
  expect(await database.get<Journal>('journals').query().fetchCount()).toBe(1);
  expect(await transactionInboxRepository.find(workplaceId, intent.inboxRecordId!)).toMatchObject({
    processingStatus: InboxProcessingStatus.IMPORTED,
    linkedJournalId: expect.any(String),
  });
});

it('does not leave an extra journal when independent handlers race to link the same SMS', async () => {
  const results = await Promise.allSettled([
    service.execute(intent, workplaceId, () => true),
    new SmsNotificationActionService().execute(intent, workplaceId, () => true),
  ]);
  expect(results.some(result => result.status === 'fulfilled' && result.value === 'logged')).toBe(
    true,
  );
  expect(await database.get<Journal>('journals').query().fetchCount()).toBe(1);
});

it.each(['locked', 'privacy', 'details', 'workplace', 'grouped', 'stale'] as const)(
  'does not log under %s protection',
  async protection => {
    if (protection === 'privacy') preferences.update({ isPrivacyMode: true });
    if (protection === 'details') preferences.device.update({ showSmsNotificationDetails: false });
    if (protection === 'grouped') intent.grouped = true;
    if (protection === 'stale') intent.reviewRevision = 'old-revision';
    expect(
      await service.execute(
        intent,
        protection === 'workplace' ? SMS_TEST_WORKPLACE_B : workplaceId,
        () => protection !== 'locked',
      ),
    ).toBe('review');
    expect(await database.get<Journal>('journals').query().fetchCount()).toBe(0);
  },
);

it('revalidates account changes rather than saving a stale preview', async () => {
  const account = await accountQueryRepository.find(workplaceId, sourceId);
  await database.write(() =>
    account!.update(model => {
      model.currencyCode = 'USD';
    }),
  );
  expect(await service.execute(intent, workplaceId, () => true)).toBe('review');
  expect(await database.get<Journal>('journals').query().fetchCount()).toBe(0);
});

it('keeps a failed save actionable and allows an explicit retry', async () => {
  jest.spyOn(journalService, 'createJournal').mockRejectedValueOnce(new Error('write failed'));
  await expect(service.execute(intent, workplaceId, () => true)).rejects.toThrow('write failed');
  expect(await transactionInboxRepository.find(workplaceId, intent.inboxRecordId!)).toMatchObject({
    processingStatus: InboxProcessingStatus.PENDING,
  });
  expect(await service.execute(intent, workplaceId, () => true)).toBe('logged');
  expect(await database.get<Journal>('journals').query().fetchCount()).toBe(1);
});

it('ignores without posting and restores the review on undo', async () => {
  intent.actionIdentifier = SMS_IGNORE_ACTION;
  expect(await service.execute(intent, workplaceId, () => true)).toBe('ignored');
  expect(await transactionInboxRepository.find(workplaceId, intent.inboxRecordId!)).toMatchObject({
    processingStatus: InboxProcessingStatus.DISMISSED,
  });
  expect(await database.get<Journal>('journals').query().fetchCount()).toBe(0);
  await service.undoIgnore(intent, workplaceId, () => true);
  expect(await transactionInboxRepository.find(workplaceId, intent.inboxRecordId!)).toMatchObject({
    processingStatus: InboxProcessingStatus.PENDING,
  });
});

it('does not undo after the app locks', async () => {
  intent.actionIdentifier = SMS_IGNORE_ACTION;
  await service.execute(intent, workplaceId, () => true);
  await service.undoIgnore(intent, workplaceId, () => false);
  expect(await transactionInboxRepository.find(workplaceId, intent.inboxRecordId!)).toMatchObject({
    processingStatus: InboxProcessingStatus.DISMISSED,
  });
});

it('does not let undo overwrite an already logged review', async () => {
  await service.execute(intent, workplaceId, () => true);
  await service.undoIgnore(intent, workplaceId, () => true);
  expect(await transactionInboxRepository.find(workplaceId, intent.inboxRecordId!)).toMatchObject({
    processingStatus: InboxProcessingStatus.IMPORTED,
  });
});

it('rejects incomplete, unparsed, cross-currency, archived, and previously consumed suggestions', async () => {
  const record = (await transactionInboxRepository.find(workplaceId, intent.inboxRecordId!))!;
  const accounts = await accountQueryRepository.findAllByIds(workplaceId, [
    record.suggestedSourceAccountId!,
    record.suggestedCategoryAccountId!,
  ]);
  for (const changes of [
    { parsedAmount: Number.NaN },
    { parsedAmount: 0 },
    { suggestedCategoryAccountId: undefined },
    { parseStatus: InboxParseStatus.PARSE_FAILED },
    { parsedCurrencyCode: 'USD' },
    { consumedWorkplaces: [{ workplaceId: SMS_TEST_WORKPLACE_B, name: 'Other workplace' }] },
  ])
    expect(canQuickLogSms({ ...record, ...changes }, accounts)).toBe(false);
  expect(
    canQuickLogSms(
      record,
      accounts.map(account => ({ ...toPlainAccount(account), archivedAt: Date.now() })),
    ),
  ).toBe(false);
  expect(smsReviewRevision(record, accounts)).toBe(
    smsReviewRevision(record, [...accounts].reverse()),
  );
});

it('rechecks the launch gate after asynchronous account reads', async () => {
  let ready = true;
  const find = accountQueryRepository.findAllByIds.bind(accountQueryRepository);
  jest.spyOn(accountQueryRepository, 'findAllByIds').mockImplementationOnce(async (...args) => {
    ready = false;
    return find(...args);
  });
  expect(await service.execute(intent, workplaceId, () => ready)).toBe('review');
  expect(await database.get<Journal>('journals').query().fetchCount()).toBe(0);
});
