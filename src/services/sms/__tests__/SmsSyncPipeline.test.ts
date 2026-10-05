import { SmsSyncPipeline } from '../pipeline';
import { WorkplaceId } from '@/src/types/ids';

describe('SmsSyncPipeline', () => {
  let pipeline: SmsSyncPipeline;

  beforeEach(() => {
    pipeline = new SmsSyncPipeline();
    jest.clearAllMocks();
  });

  describe('scan coordination', () => {
    const flushMicrotasks = async () => {
      for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
      }
    };

    const deferred = <T>() => {
      let resolve!: (value: T) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, resolve, reject };
    };

    it('serializes concurrent scans for the same workplace without changing their limits', async () => {
      const firstScan = deferred<number>();
      const secondScan = deferred<number>();
      const scanOnce = jest
        .spyOn(pipeline as any, 'scanInboxOnce')
        .mockReturnValueOnce(firstScan.promise)
        .mockReturnValueOnce(secondScan.promise);

      const recent = pipeline.scanInbox('wp-1' as WorkplaceId, 50);
      const older = pipeline.scanInbox('wp-1' as WorkplaceId, 100);
      await flushMicrotasks();

      expect(scanOnce).toHaveBeenCalledTimes(1);
      expect(scanOnce).toHaveBeenNthCalledWith(1, 'wp-1', 50, undefined, {});

      firstScan.resolve(1);
      await expect(recent).resolves.toBe(1);
      await flushMicrotasks();

      expect(scanOnce).toHaveBeenCalledTimes(2);
      expect(scanOnce).toHaveBeenNthCalledWith(2, 'wp-1', 100, undefined, {});

      secondScan.resolve(2);
      await expect(older).resolves.toBe(2);
    });

    it('does not serialize scans belonging to different workplaces', async () => {
      const firstScan = deferred<number>();
      const secondScan = deferred<number>();
      const scanOnce = jest
        .spyOn(pipeline as any, 'scanInboxOnce')
        .mockReturnValueOnce(firstScan.promise)
        .mockReturnValueOnce(secondScan.promise);

      const workplaceA = pipeline.scanInbox('wp-a' as WorkplaceId, 50);
      const workplaceB = pipeline.scanInbox('wp-b' as WorkplaceId, 75);
      await flushMicrotasks();

      expect(scanOnce).toHaveBeenCalledTimes(2);
      expect(scanOnce).toHaveBeenCalledWith('wp-a', 50, undefined, {});
      expect(scanOnce).toHaveBeenCalledWith('wp-b', 75, undefined, {});

      firstScan.resolve(3);
      secondScan.resolve(4);
      await expect(Promise.all([workplaceA, workplaceB])).resolves.toEqual([3, 4]);
    });

    it('continues the workplace queue after a failed scan', async () => {
      const firstScan = deferred<number>();
      const scanOnce = jest
        .spyOn(pipeline as any, 'scanInboxOnce')
        .mockReturnValueOnce(firstScan.promise)
        .mockResolvedValueOnce(5);

      const failed = pipeline.scanInbox('wp-1' as WorkplaceId, 50);
      const retry = pipeline.scanInbox('wp-1' as WorkplaceId, 50);
      await flushMicrotasks();

      firstScan.reject(new Error('native inbox failed'));
      await expect(failed).rejects.toThrow('native inbox failed');
      await expect(retry).resolves.toBe(5);
      expect(scanOnce).toHaveBeenCalledTimes(2);
    });
  });
});
