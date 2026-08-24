import { database } from '@/src/data/database/Database';
import { persistBatch } from '@/src/data/repositories/persistBatch';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(),
    batch: jest.fn(),
  },
}));

const mockDatabase = database as unknown as {
  write: jest.Mock;
  batch: jest.Mock;
};

describe('persistBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabase.batch.mockResolvedValue(undefined);
    mockDatabase.write.mockImplementation(async (work: () => Promise<boolean>) => work());
  });

  it('runs afterBatch only after the database writer resolves', async () => {
    let resolveWrite!: () => void;
    const writerResolved = new Promise<void>(resolve => {
      resolveWrite = resolve;
    });
    mockDatabase.write.mockImplementation(async (work: () => Promise<boolean>) => {
      const result = await work();
      await writerResolved;
      return result;
    });

    const afterBatch = jest.fn();
    const persistPromise = persistBatch(['prepared-op'] as any[], afterBatch);

    await Promise.resolve();
    expect(mockDatabase.batch).toHaveBeenCalledWith(['prepared-op']);
    expect(afterBatch).not.toHaveBeenCalled();

    resolveWrite();
    await persistPromise;

    expect(afterBatch).toHaveBeenCalledTimes(1);
  });

  it('does not run afterBatch when the batch fails', async () => {
    const error = new Error('batch failed');
    mockDatabase.batch.mockRejectedValue(error);
    const afterBatch = jest.fn();

    await expect(persistBatch(['prepared-op'] as any[], afterBatch)).rejects.toBe(error);

    expect(afterBatch).not.toHaveBeenCalled();
  });

  it('does not run afterBatch for an empty batch', async () => {
    const afterBatch = jest.fn();

    await persistBatch([], afterBatch);

    expect(mockDatabase.batch).not.toHaveBeenCalled();
    expect(afterBatch).not.toHaveBeenCalled();
  });
});
