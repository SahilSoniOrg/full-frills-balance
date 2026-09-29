import { database } from '@/src/data/database/Database';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { AccountId, WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: { get: jest.fn() },
  },
}));

describe('AccountQueryRepository', () => {
  const workplaceId = 'workplace-1' as WorkplaceId;
  const accountId = 'account-1' as AccountId;
  const fetch = jest.fn();
  const query = jest.fn(() => ({ fetch }));

  beforeEach(() => {
    fetch.mockReset();
    query.mockClear();
    (database.collections.get as jest.Mock).mockReturnValue({ query });
  });

  it('returns a scoped non-deleted account or null when missing', async () => {
    const account = { id: accountId };
    fetch.mockResolvedValueOnce([account]).mockResolvedValueOnce([]);

    await expect(accountQueryRepository.find(workplaceId, accountId)).resolves.toBe(account);
    await expect(accountQueryRepository.find(workplaceId, accountId)).resolves.toBeNull();

    const clauses = query.mock.calls[0];
    expect(clauses).toHaveLength(3);
  });

  it('propagates unexpected database failures instead of treating them as missing rows', async () => {
    const failure = new Error('database unavailable');
    fetch.mockRejectedValueOnce(failure);

    await expect(accountQueryRepository.find(workplaceId, accountId)).rejects.toBe(failure);
  });
});
