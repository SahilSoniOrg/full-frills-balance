import { executeBoundedBatchWrite } from '../dbGuardrails';

describe('executeBoundedBatchWrite', () => {
  it('should handle empty or null ops gracefully without writing', async () => {
    const mockDb = {
      write: jest.fn(),
      batch: jest.fn(),
    } as any;

    await executeBoundedBatchWrite(mockDb, []);
    expect(mockDb.write).not.toHaveBeenCalled();
    expect(mockDb.batch).not.toHaveBeenCalled();
  });

  it('should chunk ops into bounded transaction writes', async () => {
    const mockDb = {
      write: jest.fn(fn => fn()),
      batch: jest.fn(),
    } as any;

    const mockOps = Array.from({ length: 250 }, (_, i) => ({ id: `op-${i}` })) as any;

    await executeBoundedBatchWrite(mockDb, mockOps, 100);

    expect(mockDb.write).toHaveBeenCalledTimes(3);
    expect(mockDb.batch).toHaveBeenCalledTimes(3);
    expect(mockDb.batch).toHaveBeenNthCalledWith(1, mockOps.slice(0, 100));
    expect(mockDb.batch).toHaveBeenNthCalledWith(2, mockOps.slice(100, 200));
    expect(mockDb.batch).toHaveBeenNthCalledWith(3, mockOps.slice(200, 250));
  });

  it('should respect custom chunk sizes', async () => {
    const mockDb = {
      write: jest.fn(fn => fn()),
      batch: jest.fn(),
    } as any;

    const mockOps = Array.from({ length: 15 }, (_, i) => ({ id: `op-${i}` })) as any;

    await executeBoundedBatchWrite(mockDb, mockOps, 5);

    expect(mockDb.write).toHaveBeenCalledTimes(3);
    expect(mockDb.batch).toHaveBeenCalledTimes(3);
  });
});
