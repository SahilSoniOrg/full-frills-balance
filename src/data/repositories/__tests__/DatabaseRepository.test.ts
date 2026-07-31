import { database } from '@/src/data/database/Database';
import { getRawAdapter } from '@/src/data/database/DatabaseUtils';
import { DatabaseRepository } from '../DatabaseRepository';
import { WorkplaceId } from '@/src/types/domain';

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
});
