import { database } from '@/src/data/database/Database';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction/TransactionQueryRepository';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: { get: jest.fn() },
  },
}));

type ScopedFindCase = {
  label: string;
  find: (workplaceId: WorkplaceId, id: string) => Promise<unknown>;
  entityId: string;
  entity: { id: string };
};

describe.each<ScopedFindCase>([
  {
    label: 'AccountQueryRepository',
    find: (workplaceId, id) => accountQueryRepository.find(workplaceId, id as AccountId),
    entityId: 'account-1',
    entity: { id: 'account-1' },
  },
  {
    label: 'TransactionQueryRepository',
    find: (workplaceId, id) => transactionQueryRepository.find(workplaceId, id as TransactionId),
    entityId: 'transaction-1',
    entity: { id: 'transaction-1' },
  },
])('$label.find', ({ find, entityId, entity }) => {
  const workplaceId = 'workplace-1' as WorkplaceId;
  const fetch = jest.fn();
  const query = jest.fn(() => ({ fetch }));

  beforeEach(() => {
    fetch.mockReset();
    query.mockClear();
    (database.collections.get as jest.Mock).mockReturnValue({ query });
  });

  it('returns a scoped row or null when missing', async () => {
    fetch.mockResolvedValueOnce([entity]).mockResolvedValueOnce([]);

    await expect(find(workplaceId, entityId)).resolves.toBe(entity);
    await expect(find(workplaceId, entityId)).resolves.toBeNull();

    expect(query.mock.calls[0]).toHaveLength(3);
  });

  it('propagates unexpected database failures instead of treating them as missing rows', async () => {
    const failure = new Error('database unavailable');
    fetch.mockRejectedValueOnce(failure);

    await expect(find(workplaceId, entityId)).rejects.toBe(failure);
  });
});
