import { database } from '@/src/data/database/Database';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { asWorkplaceId } from '@/src/types/ids';
import { exportWorkplacesToJSON } from '../nativeBackupExporter';
import { compression } from '@/src/utils/compression';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { seedSnapshotWorkplace } from '@/src/services/backup/__tests__/snapshotTestHelpers';
import { preferences } from '@/src/services/preferences';
import { DEFAULT_UI_PREFERENCES } from '@/src/services/preferences/types';

jest.mock('@/src/utils/compression', () => ({ compression: { createZipArchive: jest.fn() } }));

beforeEach(async () => {
  await resetDatabase();
  preferences.workplace.clear();
  // The global MMKV test double has no persistence. This test exercises ledger capture, not preference migration.
  jest.spyOn(preferences, 'loadPreferences').mockResolvedValue({ ...DEFAULT_UI_PREFERENCES });
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('captures legacy v2 backup data before compression and releases the reader before file work', async () => {
  const { workplaceId, fixture, journal } = await seedSnapshotWorkplace();
  const cleanup = jest.fn();
  const zip = jest.mocked(compression.createZipArchive);
  zip.mockImplementationOnce(async () => {
    // Awaiting a real writer here deadlocks if compression incorrectly holds the snapshot reader.
    await journalPersistenceRepository.put(
      fixture.putInput({ journalId: journal.id, transactions: fixture.lines(25, 25) }),
      workplaceId,
    );
    return { base64: 'zip-content', uri: 'memory://archive.zip', cleanup };
  });
  expect(await exportWorkplacesToJSON([workplaceId], 'selected')).toBe('zip-content');
  const payload = JSON.parse(String(zip.mock.calls[0][1]['backup.json']));
  expect(payload.formatVersion).toBe(2);
  expect(payload.workplaces[0].data.journals[0].totalAmount).toBe(10);
  expect(
    payload.workplaces[0].data.transactions.map((row: { amount: number }) => row.amount),
  ).toEqual([10, 10]);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('lets a queued accounting write run between separately captured Workplaces', async () => {
  const { workplaceId, snapshot } = await seedSnapshotWorkplace();
  const second = asWorkplaceId('second-export');
  await workplaceRepository.create({ ...snapshot.workplace, id: second });
  const original = exportRepository.fetchOrmTable.bind(exportRepository);
  let written = false;
  let writing: Promise<void> | undefined;
  jest
    .spyOn(exportRepository, 'fetchOrmTable')
    .mockImplementation(async (table, columns, id, sources) => {
      if (id === second) expect(written).toBe(true);
      const rows = await original(table, columns, id, sources);
      if (id === workplaceId && table === 'balance_snapshots')
        writing = database.write(async () => {
          written = true;
        });
      return rows;
    });
  jest
    .mocked(compression.createZipArchive)
    .mockResolvedValueOnce({ base64: 'zip', uri: 'memory://zip', cleanup: () => undefined });
  await exportWorkplacesToJSON([workplaceId, second], 'selected');
  await writing;
  expect(written).toBe(true);
});
