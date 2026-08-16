import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { RebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';

jest.mock('@/src/services/AccountingRebuildService', () => ({
  accountingRebuildService: {
    rebuildAccountBalances: jest.fn(),
  },
}));

jest.mock('@/src/utils/storage', () => ({
  storage: {
    getString: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const accountId = 'account-1' as AccountId;
const workplaceId = 'workplace-1' as WorkplaceId;
const rebuildAccountBalances = accountingRebuildService.rebuildAccountBalances as jest.Mock;
const storageSet = storage.set as jest.Mock;

function createQueue(config: { retryLimit?: number } = {}): RebuildQueueService {
  return new RebuildQueueService({
    debounceMs: 100,
    maxBatchSize: 10,
    retryLimit: config.retryLimit ?? 2,
    retryDelayMs: 1_000,
  });
}

describe('RebuildQueueService lifecycle', () => {
  let queue: RebuildQueueService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    queue = createQueue();
  });

  afterEach(() => {
    queue.stop();
    jest.useRealTimers();
  });

  it('retries a transient failure and flushes retry-delayed work before resolving', async () => {
    rebuildAccountBalances
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(null);
    queue.enqueue(accountId, 123, workplaceId);

    await queue.flush();

    expect(rebuildAccountBalances).toHaveBeenCalledTimes(2);
    expect(rebuildAccountBalances).toHaveBeenNthCalledWith(1, workplaceId, accountId, 123);
    expect(rebuildAccountBalances).toHaveBeenNthCalledWith(2, workplaceId, accountId, 123);
    expect(queue.hasPending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for active processing and drains the retry it schedules', async () => {
    let rejectFirstAttempt: ((error: Error) => void) | undefined;
    rebuildAccountBalances
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstAttempt = reject;
          }),
      )
      .mockResolvedValueOnce(null);
    queue.enqueue(accountId, 456, workplaceId);
    await jest.advanceTimersByTimeAsync(100);

    const flushPromise = queue.flush();
    let flushResolved = false;
    void flushPromise.then(() => {
      flushResolved = true;
    });
    await Promise.resolve();
    expect(flushResolved).toBe(false);

    rejectFirstAttempt?.(new Error('transient'));
    await flushPromise;

    expect(rebuildAccountBalances).toHaveBeenCalledTimes(2);
    expect(queue.hasPending).toBe(false);
  });

  it('stop cancels retry timers and prevents stopped work from returning', async () => {
    rebuildAccountBalances.mockRejectedValue(new Error('transient'));
    queue.enqueue(accountId, 789, workplaceId);

    await jest.advanceTimersByTimeAsync(100);
    expect(rebuildAccountBalances).toHaveBeenCalledTimes(1);
    expect(queue.hasPending).toBe(true);

    queue.stop();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(rebuildAccountBalances).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount).toBe(0);
    expect(queue.hasPending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stop invalidates an in-flight failure before it can schedule a retry', async () => {
    let rejectAttempt: ((error: Error) => void) | undefined;
    rebuildAccountBalances.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectAttempt = reject;
        }),
    );
    queue.enqueue(accountId, 321, workplaceId);
    await jest.advanceTimersByTimeAsync(100);

    queue.stop();
    const stoppedFlush = queue.flush();
    rejectAttempt?.(new Error('late failure'));
    await stoppedFlush;
    await jest.advanceTimersByTimeAsync(5_000);

    expect(rebuildAccountBalances).toHaveBeenCalledTimes(1);
    expect(queue.hasPending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('coalesces a fresh enqueue with an existing delayed retry', async () => {
    rebuildAccountBalances.mockRejectedValueOnce(new Error('transient')).mockResolvedValue(null);
    queue.enqueue(accountId, 500, workplaceId);
    await jest.advanceTimersByTimeAsync(100);

    queue.enqueue(accountId, 100, workplaceId);
    await queue.flush();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(rebuildAccountBalances).toHaveBeenCalledTimes(2);
    expect(rebuildAccountBalances).toHaveBeenLastCalledWith(workplaceId, accountId, 100);
    expect(queue.hasPending).toBe(false);
  });

  it('stops retrying after the configured terminal failure limit', async () => {
    queue = createQueue({ retryLimit: 2 });
    rebuildAccountBalances.mockRejectedValue(new Error('permanent'));
    queue.enqueue(accountId, 999, workplaceId);

    await queue.flush();

    expect(rebuildAccountBalances).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Giving up on account workplace-1__account-1 after 3 attempts'),
    );
    expect(queue.hasPending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('requeues a batch after an unexpected processing error', async () => {
    rebuildAccountBalances.mockResolvedValue(null);
    let shouldFailProcessingWrite = true;
    storageSet.mockImplementation((key: string) => {
      if (key === 'rebuild_processing_batch_v1' && shouldFailProcessingWrite) {
        shouldFailProcessingWrite = false;
        throw new Error('processing storage unavailable');
      }
    });
    queue.enqueue(accountId, 777, workplaceId);

    await queue.flush();

    expect(rebuildAccountBalances).toHaveBeenCalledTimes(1);
    expect(rebuildAccountBalances).toHaveBeenCalledWith(workplaceId, accountId, 777);
    expect(queue.hasPending).toBe(false);
  });
});
