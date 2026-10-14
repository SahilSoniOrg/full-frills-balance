import AuditLog from '@/src/data/models/AuditLog';
import { database } from '@/src/data/database/Database';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { preferences } from '@/src/services/preferences';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import BudgetScope from '@/src/data/models/BudgetScope';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  AccountType,
  InboxParseStatus,
  InboxProcessingStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionDirection,
} from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { restoreWorkplaceSnapshot } from '../restoreWorkplaceSnapshot';
import {
  seedSnapshotWorkplace,
  enableTestCrypto,
} from '@/src/services/backup/__tests__/snapshotTestHelpers';
import { captureWorkplaceSnapshot } from '@/src/services/backup/workplaceSnapshot';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));

beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
  preferences.workplace.clear();
});

it('preserves identities and references, publishes atomically, and leaves activation/preferences to the finisher', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  const active = preferences.device.activeWorkplaceId;
  const name = preferences.userName;
  const [first, repeated] = await Promise.all([
    restoreWorkplaceSnapshot(snapshot),
    restoreWorkplaceSnapshot(snapshot),
  ]);
  expect(first).toEqual(repeated);
  expect(first.workplaceId).toBe(snapshot.workplace.id);
  expect(await database.get('workplaces').query().fetchCount()).toBe(1);
  const accounts = await database.get('accounts').query().fetch();
  expect(accounts.map(row => row.id).sort()).toEqual(
    snapshot.data.accounts.map(row => row.id).sort(),
  );
  const journals = await database.get('journals').query().fetch();
  expect(journals.map(row => row.id)).toEqual(snapshot.data.journals.map(row => row.id));
  expect(await database.get('transactions').query().fetchCount()).toBe(
    snapshot.data.transactions.length,
  );
  expect((await workplaceRepository.find(first.workplaceId))?.snapshotRestoreFingerprint).toMatch(
    /^sha256:/,
  );
  expect(preferences.device.activeWorkplaceId).toBe(active);
  expect(preferences.userName).toBe(name);
  const auditCount = await database.get('audit_logs').query().fetchCount();
  await restoreWorkplaceSnapshot(snapshot);
  expect(await database.get('audit_logs').query().fetchCount()).toBe(auditCount);
});

it('refuses to overwrite an existing local Workplace or a different snapshot', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await expect(restoreWorkplaceSnapshot(snapshot)).rejects.toThrow('will not overwrite');
  await resetDatabase();
  await restoreWorkplaceSnapshot(snapshot);
  await expect(
    restoreWorkplaceSnapshot({ ...snapshot, capturedAt: snapshot.capturedAt + 1 }),
  ).rejects.toThrow('will not overwrite');
  expect(await database.get('workplaces').query().fetchCount()).toBe(1);
});

it('does not publish a cancelled restore that was already queued behind another writer', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  let started!: () => void, release!: () => void, queued!: () => void;
  const running = new Promise<void>(resolve => {
    started = resolve;
  });
  const pause = new Promise<void>(resolve => {
    release = resolve;
  });
  const enqueued = new Promise<void>(resolve => {
    queued = resolve;
  });
  const blocker = database.write(async () => {
    started();
    await pause;
  });
  await running;
  const originalWrite = database.write.bind(database);
  const write = jest.spyOn(database, 'write').mockImplementation((work, description) => {
    const result = originalWrite(work, description);
    queued();
    return result;
  });
  const controller = new AbortController();
  const restoring = restoreWorkplaceSnapshot(snapshot, controller.signal);
  try {
    await enqueued;
    controller.abort();
    release();
    await blocker;
    await expect(restoring).rejects.toMatchObject({ code: 'FFB_KEY_CANCELLED' });
    expect(await database.get('workplaces').query().fetchCount()).toBe(0);
    expect(await database.get('accounts').query().fetchCount()).toBe(0);
  } finally {
    release();
    await blocker;
    write.mockRestore();
  }
});

it('rejects a Workplace collision introduced by the writer ahead of a queued restore', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  let started!: () => void, release!: () => void, queued!: () => void;
  const running = new Promise<void>(resolve => {
    started = resolve;
  });
  const pause = new Promise<void>(resolve => {
    release = resolve;
  });
  const enqueued = new Promise<void>(resolve => {
    queued = resolve;
  });
  const blocker = database.write(async () => {
    started();
    await pause;
    await database.batch(
      workplaceRepository.prepareCreate({
        ...snapshot.workplace,
        id: asWorkplaceId(snapshot.workplace.id),
        name: 'New local books',
      }),
    );
  });
  await running;
  const originalWrite = database.write.bind(database);
  const write = jest.spyOn(database, 'write').mockImplementation((work, description) => {
    const result = originalWrite(work, description);
    queued();
    return result;
  });
  const restoring = restoreWorkplaceSnapshot(snapshot);
  const rejected = expect(restoring).rejects.toMatchObject({ code: 'FFB_KEY_WORKPLACE_COLLISION' });
  try {
    await enqueued;
    release();
    await blocker;
    await rejected;
    const existing = await workplaceRepository.find(asWorkplaceId(snapshot.workplace.id));
    expect(existing?.name).toBe('New local books');
    expect(existing?.snapshotRestoreFingerprint).toBeFalsy();
    expect(await database.get('accounts').query().fetchCount()).toBe(0);
  } finally {
    release();
    write.mockRestore();
  }
});

it('rejects source record collisions in another Workplace without publishing a shell', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  await accountWriteRepository.create({
    id: asAccountId(snapshot.data.accounts[0].id),
    name: 'Other books',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: asWorkplaceId('other'),
  });
  await expect(restoreWorkplaceSnapshot(snapshot)).rejects.toThrow('identity collision');
  expect(await database.get('workplaces').query().fetchCount()).toBe(0);
  expect(await database.get('accounts').query().fetchCount()).toBe(1);
});

it('rejects an unbalanced posted journal and rolls back a failed batch, then permits retry', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  const invalid = {
    ...snapshot,
    data: {
      ...snapshot.data,
      transactions: snapshot.data.transactions.map((line, index) =>
        index === 0 ? { ...line, amount: line.amount + 1 } : line,
      ),
    },
  };
  await expect(restoreWorkplaceSnapshot(invalid)).rejects.toThrow();
  expect(await database.get('workplaces').query().fetchCount()).toBe(0);
  const batch = jest.spyOn(database, 'batch').mockRejectedValueOnce(new Error('disk full'));
  await expect(restoreWorkplaceSnapshot(snapshot)).rejects.toThrow('disk full');
  batch.mockRestore();
  expect(await database.get('workplaces').query().fetchCount()).toBe(0);
  expect(await database.get('accounts').query().fetchCount()).toBe(0);
  await restoreWorkplaceSnapshot(snapshot);
  expect(await database.get('workplaces').query().fetchCount()).toBe(1);
});

it('rejects different currency precision instead of changing how money is interpreted', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  await expect(
    restoreWorkplaceSnapshot({ ...snapshot, currencyPrecisions: { USD: 0 } }),
  ).rejects.toThrow('currency precision');
  expect(await database.get('workplaces').query().fetchCount()).toBe(0);
});

it('restores budget scopes, fixed FX schedules, journal provenance, and consumed inbox links with shared IDs', async () => {
  const { workplaceId, fixture, journal } = await seedSnapshotWorkplace();
  const euro = await accountWriteRepository.create({
    name: 'Euro asset',
    accountType: AccountType.ASSET,
    currencyCode: 'EUR',
    workplaceId,
  });
  const payment = await plannedPaymentRepository.create(workplaceId, {
    name: 'Monthly FX',
    amount: 100,
    currencyCode: 'USD',
    fxMode: 'fixed',
    destinationAmount: 90,
    fromAccountId: fixture.debitAccountId,
    toAccountId: euro.id,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: Date.UTC(2026, 0, 1),
    nextOccurrence: Date.UTC(2026, 1, 1),
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: true,
  });
  const budget = await budgetRepository.create(
    workplaceId,
    {
      name: 'Food',
      amount: 500,
      currencyCode: 'USD',
      startMonth: '2026-10',
      assetAccountIds: [fixture.debitAccountId],
    },
    [fixture.creditAccountId],
  );
  await database.write(async () => {
    await database.get<JournalMetadata>('journal_metadata').create(row => {
      row.workplaceId = workplaceId;
      row.journalId = journal.id;
      row.importSource = 'sms';
      row.originalSmsBody = 'Raw bank source';
      row.referenceNumber = 'BANK-REF';
      row.createdAt = new Date();
      row.updatedAt = new Date();
    });
    await database.get<TransactionInboxRecord>('transaction_inbox_records').create(row => {
      row.workplaceId = workplaceId;
      row.channel = 'sms';
      row.deviceSourceId = 'device-source-1';
      row.rawBody = 'Raw bank source';
      row.senderAddress = 'BANK';
      row.inputDate = 1_000;
      row.inputFingerprint = 'bank::raw-content';
      row.parseStatus = InboxParseStatus.PARSED;
      row.processingStatus = InboxProcessingStatus.IMPORTED;
      row.direction = TransactionDirection.DEBIT;
      row.linkedJournalId = journal.id;
      row.firstSeenAt = 1_000;
      row.lastScannedAt = 1_000;
    });
  });
  const snapshot = await captureWorkplaceSnapshot(workplaceId);
  expect(snapshot.currencyPrecisions).toEqual({ USD: 2, EUR: 2 });
  expect(JSON.stringify(snapshot)).not.toContain('Raw bank source');
  await resetDatabase();
  await restoreWorkplaceSnapshot(snapshot);
  const restored = await database.get<PlannedPayment>('planned_payments').find(payment.id);
  expect(restored.fromAccountId).toBe(fixture.debitAccountId);
  expect(restored.toAccountId).toBe(euro.id);
  expect(restored.fxMode).toBe('fixed');
  expect(restored.destinationAmount).toBe(90);
  const scopes = await database.get<BudgetScope>('budget_scopes').query().fetch();
  expect(scopes.map(scope => [scope.budgetId, scope.accountId])).toEqual([
    [budget.id, fixture.creditAccountId],
  ]);
  const metadata = await database.get<JournalMetadata>('journal_metadata').query().fetch();
  expect(metadata[0].referenceNumber).toBe('BANK-REF');
  expect(metadata[0].journalId).toBe(journal.id);
  const copies = await database
    .get<TransactionInboxRecord>('transaction_inbox_records')
    .query()
    .fetch();
  expect(copies[0].linkedJournalId).toBe(journal.id);
  expect(copies[0].rawBody).toBeFalsy();
  expect(await database.get('device_sms_inbox_records').query().fetchCount()).toBe(0);
});

it('preserves historical audit entries without fabricating per-entity import history', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  await restoreWorkplaceSnapshot(snapshot);
  const rows = await database.get<AuditLog>('audit_logs').query().fetch();
  expect(rows.filter(row => String(row.eventType).endsWith('.imported'))).toHaveLength(0);
  const ids = new Set(rows.map(row => row.id));
  for (const row of snapshot.data.auditLogs ?? []) expect(ids.has(row.id)).toBe(true);
});

it('recognizes reordered equivalent snapshots as the same committed restore', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  await resetDatabase();
  await restoreWorkplaceSnapshot(snapshot);
  const reordered = {
    ...Object.fromEntries(Object.entries(snapshot).reverse()),
    data: { ...snapshot.data, accounts: [...snapshot.data.accounts].reverse() },
  } as typeof snapshot;
  await expect(restoreWorkplaceSnapshot(reordered)).resolves.toBeDefined();
  expect(await database.get('workplaces').query().fetchCount()).toBe(1);
});
