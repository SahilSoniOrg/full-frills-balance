import { database } from '@/src/data/database/Database';
import { getRawAdapter } from '@/src/data/database/DatabaseUtils';
import { DatabaseRepository } from '../DatabaseRepository';
import { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(async (work: () => Promise<unknown>) => work()),
    collections: { get: jest.fn() },
    batch: jest.fn(),
    unsafeResetDatabase: jest.fn(),
  },
}));
jest.mock('@/src/data/database/DatabaseUtils', () => ({ getRawAdapter: jest.fn() }));

const mockDatabase = database as unknown as {
  write: jest.Mock;
  collections: { get: jest.Mock };
  batch: jest.Mock;
};
const mockGetRawAdapter = getRawAdapter as jest.Mock;

describe('DatabaseRepository', () => {
  const repository = new DatabaseRepository();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRawAdapter.mockReturnValue(null);
  });

  it('cleans only synced deleted records', async () => {
    const synced = {
      _raw: { _status: 'synced' },
      prepareDestroyPermanently: jest.fn(() => 'delete-synced'),
    };
    const pending = {
      _raw: { _status: 'updated' },
      prepareDestroyPermanently: jest.fn(() => 'delete-pending'),
    };
    mockDatabase.collections.get.mockReturnValue({
      query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([synced, pending]) })),
    });

    await expect(repository.cleanupDeletedRecords(['journals'])).resolves.toBe(1);

    expect(synced.prepareDestroyPermanently).toHaveBeenCalled();
    expect(pending.prepareDestroyPermanently).not.toHaveBeenCalled();
    expect(mockDatabase.batch).toHaveBeenCalledWith(['delete-synced']);
  });

  it('purges workplace records through the ORM fallback', async () => {
    const record = { prepareDestroyPermanently: jest.fn(() => 'delete-record') };
    mockDatabase.collections.get.mockReturnValue({
      query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([record]) })),
    });

    await repository.purgeWorkplaceData('workplace-1' as WorkplaceId, ['accounts']);

    expect(record.prepareDestroyPermanently).toHaveBeenCalled();
    expect(mockDatabase.batch).toHaveBeenCalledWith(['delete-record']);
  });

  it('reassigns staged records through the ORM fallback', async () => {
    const target = { prepareDestroyPermanently: jest.fn(() => 'delete-target') };
    const staging = {
      workplaceId: 'staging' as WorkplaceId,
      prepareUpdate: jest.fn((update: (record: typeof staging) => void) => {
        update(staging);
        return 'update-staging';
      }),
    };
    const fetchResults = [[target], [staging]];
    let fetchIndex = 0;
    mockDatabase.collections.get.mockImplementation(() => ({
      query: jest.fn(() => ({
        fetch: jest.fn().mockResolvedValue(fetchResults[fetchIndex++]),
      })),
    }));

    await repository.swapStagedWorkplaceInto('target' as WorkplaceId, 'staging' as WorkplaceId, [
      'accounts',
    ]);

    expect(staging.workplaceId).toBe('target');
    expect(mockDatabase.batch).toHaveBeenCalledWith(['delete-target', 'update-staging']);
  });

  it('syncs RecordCache after raw SQL staged import swap', async () => {
    const queryRaw = jest.fn().mockResolvedValue(undefined);
    mockGetRawAdapter.mockReturnValue({ queryRaw });

    const targetCached = { id: 'old-acc', _raw: { workplace_id: 'target' } };
    const stagingCached = { id: 'new-acc', _raw: { workplace_id: 'staging' } };
    const cacheMap = new Map<string, typeof targetCached | typeof stagingCached>([
      [targetCached.id, targetCached],
      [stagingCached.id, stagingCached],
    ]);
    const cacheDelete = jest.fn((record: { id: string }) => {
      cacheMap.delete(record.id);
    });
    const notify = jest.fn();

    mockDatabase.collections.get.mockReturnValue({
      _cache: { map: cacheMap, delete: cacheDelete },
      _notify: notify,
    });

    await repository.swapStagedWorkplaceInto('target' as WorkplaceId, 'staging' as WorkplaceId, [
      'accounts',
    ]);

    expect(queryRaw).toHaveBeenCalledWith('SAVEPOINT import_swap', []);
    expect(queryRaw).toHaveBeenCalledWith('DELETE FROM accounts WHERE workplace_id = ?', [
      'target',
    ]);
    expect(queryRaw).toHaveBeenCalledWith(
      'UPDATE accounts SET workplace_id = ? WHERE workplace_id = ?',
      ['target', 'staging'],
    );
    expect(queryRaw).toHaveBeenCalledWith('RELEASE SAVEPOINT import_swap', []);
    expect(cacheDelete).toHaveBeenCalledWith(targetCached);
    expect(cacheMap.has('old-acc')).toBe(false);
    expect(stagingCached._raw.workplace_id).toBe('target');
    expect(notify).toHaveBeenCalledWith([
      { record: targetCached, type: 'destroyed' },
      { record: stagingCached, type: 'updated' },
    ]);
  });

  it('rolls the raw staged import swap back to a savepoint when a later UPDATE fails', async () => {
    const queryRaw = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE')) {
        throw new Error('update failed');
      }
    });
    mockGetRawAdapter.mockReturnValue({ queryRaw });

    const targetCached = { id: 'old-acc', _raw: { workplace_id: 'target' } };
    const cacheMap = new Map([[targetCached.id, targetCached]]);
    mockDatabase.collections.get.mockReturnValue({
      _cache: { map: cacheMap, delete: jest.fn() },
      _notify: jest.fn(),
    });

    await expect(
      repository.swapStagedWorkplaceInto('target' as WorkplaceId, 'staging' as WorkplaceId, [
        'accounts',
      ]),
    ).rejects.toThrow('update failed');

    expect(queryRaw).toHaveBeenCalledWith('SAVEPOINT import_swap', []);
    expect(queryRaw).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT import_swap', []);
    expect(queryRaw).not.toHaveBeenCalledWith('RELEASE SAVEPOINT import_swap', []);
    expect(cacheMap.get('old-acc')).toBe(targetCached);
  });

  it('drops purged workplace rows from RecordCache after raw SQL purge', async () => {
    const queryRaw = jest.fn().mockResolvedValue(undefined);
    mockGetRawAdapter.mockReturnValue({ queryRaw });

    const cached = { id: 'acc-1', _raw: { workplace_id: 'wp-1' } };
    const other = { id: 'acc-2', _raw: { workplace_id: 'wp-2' } };
    const cacheMap = new Map([
      [cached.id, cached],
      [other.id, other],
    ]);
    const cacheDelete = jest.fn((record: { id: string }) => {
      cacheMap.delete(record.id);
    });
    const notify = jest.fn();

    mockDatabase.collections.get.mockReturnValue({
      _cache: { map: cacheMap, delete: cacheDelete },
      _notify: notify,
    });

    await repository.purgeWorkplaceData('wp-1' as WorkplaceId, ['accounts']);

    expect(cacheDelete).toHaveBeenCalledWith(cached);
    expect(cacheMap.has('acc-1')).toBe(false);
    expect(cacheMap.get('acc-2')).toBe(other);
    expect(notify).toHaveBeenCalledWith([{ record: cached, type: 'destroyed' }]);
  });
});
