import { database } from '@/src/data/database/Database';
import { transactionQueryRepository } from '@/src/data/repositories/transaction/TransactionQueryRepository';
import { TransactionId, WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: { get: jest.fn() },
  },
}));

describe('TransactionQueryRepository', () => {
  const workplaceId = 'workplace-1' as WorkplaceId;
  const transactionId = 'transaction-1' as TransactionId;
  const fetch = jest.fn();
  const query = jest.fn(() => ({ fetch }));

  beforeEach(() => {
    fetch.mockReset();
    query.mockClear();
    (database.collections.get as jest.Mock).mockReturnValue({ query });
  });

  it('returns a scoped active transaction or null when missing', async () => {
    const transaction = { id: transactionId };
    fetch.mockResolvedValueOnce([transaction]).mockResolvedValueOnce([]);

    await expect(transactionQueryRepository.find(workplaceId, transactionId)).resolves.toBe(
      transaction,
    );
    await expect(transactionQueryRepository.find(workplaceId, transactionId)).resolves.toBeNull();

    expect(query.mock.calls[0]).toHaveLength(3);
  });

  it('propagates unexpected database failures instead of treating them as missing rows', async () => {
    const failure = new Error('database unavailable');
    fetch.mockRejectedValueOnce(failure);

    await expect(transactionQueryRepository.find(workplaceId, transactionId)).rejects.toBe(failure);
  });
});
