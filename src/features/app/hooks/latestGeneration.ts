export interface LatestGenerationLease {
  isCurrent(): boolean;
  cancel(): void;
  runSerialized(task: () => void | Promise<void>): Promise<boolean>;
}

/**
 * Invalidates older asynchronous work and optionally serializes its final write.
 * Already-started work may finish, but it cannot enqueue after a newer generation.
 */
export class LatestGenerationCoordinator {
  private generation = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  begin(): LatestGenerationLease {
    const generation = ++this.generation;
    let cancelled = false;
    const isCurrent = () => !cancelled && this.generation === generation;

    return {
      isCurrent,
      cancel: () => {
        cancelled = true;
      },
      runSerialized: task => {
        const result = this.writeQueue.then(async () => {
          if (!isCurrent()) return false;
          await task();
          return true;
        });

        this.writeQueue = result.then(
          () => undefined,
          () => undefined,
        );

        return result;
      },
    };
  }
}
