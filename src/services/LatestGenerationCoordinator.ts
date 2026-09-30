export interface LatestGenerationLease {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  cancel(): void;
  runSerialized(task: () => void | Promise<void>): Promise<boolean>;
}

/** Invalidates stale work and serializes side effects that cannot be cancelled. */
export class LatestGenerationCoordinator {
  private activeController: AbortController | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  begin(): LatestGenerationLease {
    this.activeController?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    this.activeController = controller;
    const isCurrent = () => !signal.aborted;

    return {
      signal,
      isCurrent,
      cancel: () => controller.abort(),
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
