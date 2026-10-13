import { database } from '@/src/data/database/Database';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { preferences } from '@/src/services/preferences';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import {
  captureWorkplaceSnapshot,
  decodeWorkplaceSnapshot,
  parseWorkplaceSnapshot,
  serializeWorkplaceSnapshot,
  MAX_SNAPSHOT_BYTES,
} from '../workplaceSnapshot';
import { seedSnapshotWorkplace } from './snapshotTestHelpers';

beforeEach(async () => {
  await resetDatabase();
  preferences.workplace.clear();
});

it('captures only one Workplace, preserves identities, and omits projections and navigation preferences', async () => {
  const { workplaceId, journal, fixture } = await seedSnapshotWorkplace();
  preferences.workplace.update(workplaceId, {
    safeToSpendDays: 90,
    lastUsedSourceAccountId: fixture.debitAccountId,
  });
  const captured = await captureWorkplaceSnapshot(workplaceId);
  expect(captured.workplace.id).toBe(workplaceId);
  expect(captured.data.journals[0].id).toBe(journal.id);
  expect(captured.bookPreferences).toEqual({ safeToSpendDays: 90 });
  expect(captured.data.auditLogs?.length).toBeGreaterThan(0);
  expect(captured.data).not.toHaveProperty('balanceSnapshots');
  expect(captured.data).not.toHaveProperty('deviceSmsInboxRecords');
  expect(captured.data.transactions[0]).not.toHaveProperty('runningBalance');
  expect(decodeWorkplaceSnapshot(serializeWorkplaceSnapshot(captured))).toEqual(captured);
});

it('queues a financial edit until the snapshot reader finishes copying journal and legs', async () => {
  const { workplaceId, fixture, journal } = await seedSnapshotWorkplace();
  const originalRead = exportRepository.fetchOrmTable.bind(exportRepository);
  let signal!: () => void;
  const reachedJournal = new Promise<void>(resolve => {
    signal = resolve;
  });
  let release!: () => void;
  const proceed = new Promise<void>(resolve => {
    release = resolve;
  });
  const spy = jest
    .spyOn(exportRepository, 'fetchOrmTable')
    .mockImplementation(async (table, columns, id, sources) => {
      const rows = await originalRead(table, columns, id, sources);
      if (table === 'journals') {
        signal();
        await proceed;
      }
      return rows;
    });
  try {
    const capturing = captureWorkplaceSnapshot(workplaceId);
    await reachedJournal;
    let edited = false;
    const editing = journalPersistenceRepository
      .put(
        fixture.putInput({ journalId: journal.id, transactions: fixture.lines(25, 25) }),
        workplaceId,
      )
      .then(() => {
        edited = true;
      });
    await Promise.resolve();
    expect(edited).toBe(false);
    release();
    const snapshot = await capturing;
    await editing;
    expect(snapshot.data.journals[0].totalAmount).toBe(10);
    expect(snapshot.data.transactions.map(line => line.amount)).toEqual([10, 10]);
    expect((await captureWorkplaceSnapshot(workplaceId)).data.journals[0].totalAmount).toBe(25);
  } finally {
    release();
    spy.mockRestore();
  }
});

it('retains tombstone identities while excluding raw SMS metadata and preserving bank references', async () => {
  const { workplaceId, journal } = await seedSnapshotWorkplace();
  await database.write(async () => {
    await database.get<JournalMetadata>('journal_metadata').create(row => {
      row.workplaceId = workplaceId;
      row.journalId = journal.id;
      row.importSource = 'sms';
      row.originalSmsBody = 'Private bank message';
      row.originalSmsSender = 'BANK';
      row.referenceNumber = 'REF123';
      row.metadataJson = JSON.stringify({
        body: 'Private bank message',
        originalPlannedDate: 1_000,
      });
      row.createdAt = new Date();
      row.updatedAt = new Date();
    });
  });
  await journalPersistenceRepository.delete(journal.id, workplaceId);
  const snapshot = await captureWorkplaceSnapshot(workplaceId);
  expect(snapshot.data.journals[0].deletedAt).toBeDefined();
  expect(snapshot.data.transactions).toHaveLength(2);
  expect(snapshot.data.journalMetadata?.[0].referenceNumber).toBe('REF123');
  expect(serializeWorkplaceSnapshot(snapshot)).not.toContain('Private bank message');
  expect(snapshot.data.journalMetadata?.[0].metadataJson).toBe('{"originalPlannedDate":1000}');
});

it('rejects unknown versions, extra source fields, invalid enums, and missing account references', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  expect(() => parseWorkplaceSnapshot({ ...snapshot, formatVersion: 2 })).toThrow('version');
  expect(() =>
    parseWorkplaceSnapshot({ ...snapshot, data: { ...snapshot.data, deviceSmsInboxRecords: [] } }),
  ).toThrow('field');
  const invalid = JSON.parse(serializeWorkplaceSnapshot(snapshot));
  invalid.data.journals[0].status = 'INVALID';
  expect(() => parseWorkplaceSnapshot(invalid)).toThrow('journal status');
  invalid.data.journals[0].status = snapshot.data.journals[0].status;
  invalid.data.transactions[0].accountId = 'missing';
  expect(() => parseWorkplaceSnapshot(invalid)).toThrow('missing account');
});

it('rejects duplicate IDs, non-finite amounts, and oversized input', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const data = {
    ...snapshot.data,
    transactions: [...snapshot.data.transactions, snapshot.data.transactions[0]],
  };
  expect(() => parseWorkplaceSnapshot({ ...snapshot, data })).toThrow('duplicate');
  expect(() =>
    parseWorkplaceSnapshot({
      ...snapshot,
      data: {
        ...snapshot.data,
        transactions: [
          { ...snapshot.data.transactions[0], amount: Infinity },
          snapshot.data.transactions[1],
        ],
      },
    }),
  ).toThrow('amount');
  expect(() => decodeWorkplaceSnapshot(' '.repeat(MAX_SNAPSHOT_BYTES + 1))).toThrow('size');
});
