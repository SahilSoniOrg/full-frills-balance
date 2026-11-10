import type { WorkplaceId } from '@/src/types/ids';

type QueueEntry = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

/**
 * Serializes workplace-scoped MMKV-only mutations without opening a DB writer.
 * Accounting writes still use runAccountingWriteSession.
 */
class WorkplaceWriteCoordinator {
  private readonly queues = new Map<WorkplaceId, QueueEntry[]>();
  private readonly active = new Set<WorkplaceId>();

  async run<T>(workplaceId: WorkplaceId, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queue = this.queues.get(workplaceId) ?? [];
      queue.push({
        run: work,
        resolve: value => resolve(value as T),
        reject,
      });
      this.queues.set(workplaceId, queue);
      void this.drain(workplaceId);
    });
  }

  private async drain(workplaceId: WorkplaceId): Promise<void> {
    if (this.active.has(workplaceId)) return;
    this.active.add(workplaceId);
    try {
      for (;;) {
        const queue = this.queues.get(workplaceId);
        const next = queue?.shift();
        if (!next) {
          this.queues.delete(workplaceId);
          break;
        }
        try {
          next.resolve(await next.run());
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      this.active.delete(workplaceId);
    }
  }
}

export const workplaceWriteCoordinator = new WorkplaceWriteCoordinator();
