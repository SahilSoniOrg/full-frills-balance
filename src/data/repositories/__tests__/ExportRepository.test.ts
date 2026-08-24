import { database } from '@/src/data/database/Database';
import { asWorkplaceId } from '@/src/types/ids';
import { ExportRepository } from '../ExportRepository';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: { get: jest.fn() },
  },
}));

describe('ExportRepository.fetchOrmTable', () => {
  const repository = new ExportRepository();
  const mockGet = database.collections.get as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes workplace-owned tables before projecting ORM rows', async () => {
    const rows = [{ _raw: { id: 'account-1', workplace_id: 'workplace-1' } }];
    const fetch = jest.fn().mockResolvedValue(rows);
    const query = jest.fn().mockReturnValue({ fetch });
    mockGet.mockReturnValue({ query });

    await expect(
      repository.fetchOrmTable('accounts', ['id', 'workplace_id'], asWorkplaceId('workplace-1')),
    ).resolves.toEqual([{ id: 'account-1', workplaceId: 'workplace-1' }]);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'where',
        left: 'workplace_id',
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not add a workplace predicate to global tables', async () => {
    const query = jest.fn().mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) });
    mockGet.mockReturnValue({ query });

    await repository.fetchOrmTable('currencies', ['id', 'code'], asWorkplaceId('workplace-1'));

    expect(query).toHaveBeenCalledWith();
  });
});
