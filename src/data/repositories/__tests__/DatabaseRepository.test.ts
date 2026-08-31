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

  it('destroys scoped rows and the workplace shell in one write', async () => {
    const scoped = { prepareDestroyPermanently: jest.fn(() => 'delete-scoped') };
    const shell = { prepareDestroyPermanently: jest.fn(() => 'delete-shell') };
    mockDatabase.collections.get.mockImplementation((table: string) => {
      if (table === 'workplaces') {
        return {
          find: jest.fn().mockResolvedValue(shell),
        };
      }
      return {
        query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([scoped]) })),
      };
    });

    await repository.destroyWorkplace('workplace-1' as WorkplaceId, ['accounts']);

    expect(mockDatabase.write).toHaveBeenCalledTimes(1);
    expect(scoped.prepareDestroyPermanently).toHaveBeenCalled();
    expect(shell.prepareDestroyPermanently).toHaveBeenCalled();
    expect(mockDatabase.batch).toHaveBeenCalledWith(['delete-scoped', 'delete-shell']);
  });

  it('serializes raw workplace destruction through the database write queue', async () => {
    const executeRawBatch = jest.fn().mockResolvedValue(undefined);
    mockGetRawAdapter.mockReturnValue({ executeRawBatch });

    await repository.destroyWorkplace('workplace-1' as WorkplaceId, ['accounts']);

    expect(mockDatabase.write).toHaveBeenCalledTimes(1);
    expect(executeRawBatch).toHaveBeenCalledWith([
      ['DELETE FROM accounts WHERE workplace_id = ?', ['workplace-1']],
      ['DELETE FROM workplaces WHERE id = ?', ['workplace-1']],
    ]);
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
