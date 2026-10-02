export interface LatestGenerationLease {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  cancel(): void;
}

/** Cancels work from previous generations. */
export class LatestGenerationCoordinator {
  private activeController: AbortController | null = null;

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
    };
  }
}
