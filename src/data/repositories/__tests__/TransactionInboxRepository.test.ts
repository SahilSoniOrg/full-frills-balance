import { database } from '@/src/data/database/Database';
import { TransactionInboxRepository } from '../TransactionInboxRepository';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(async (work: () => Promise<unknown>) => work()),
    batch: jest.fn(),
    collections: { get: jest.fn() },
  },
}));

const mockDatabase = database as unknown as {
  write: jest.Mock;
  batch: jest.Mock;
};

describe('TransactionInboxRepository.persistScanBatch', () => {
  const repository = new TransactionInboxRepository();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not batch or run post-commit bookkeeping when cancelled after building ops', async () => {
    const controller = new AbortController();
    const afterBatch = jest.fn();
    const buildOps = jest.fn(() => {
      controller.abort();
      return ['prepared-op'] as any[];
    });

    await expect(
      repository.persistScanBatch(buildOps, afterBatch, controller.signal),
    ).resolves.toBe(false);

    expect(mockDatabase.batch).not.toHaveBeenCalled();
    expect(afterBatch).not.toHaveBeenCalled();
  });

  it('runs post-commit bookkeeping only after batching', async () => {
    const afterBatch = jest.fn();
    const buildOps = jest.fn(() => ['prepared-op'] as any[]);

    await expect(repository.persistScanBatch(buildOps, afterBatch)).resolves.toBe(true);

    expect(mockDatabase.batch).toHaveBeenCalledWith(['prepared-op']);
    expect(afterBatch).toHaveBeenCalledTimes(1);
  });
});
