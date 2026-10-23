/**
 * Executes a task after interactions have finished, or when the system is idle.
 * Uses requestIdleCallback where available (modern React Native / Web),
 * falling back to the next event-loop turn.
 */
export function runAfterInteractions(
  task: () => void | Promise<void>,
  timeout: number = 2500,
): () => void {
  if (typeof requestIdleCallback !== 'undefined') {
    const handle = requestIdleCallback(() => task(), { timeout });
    return () => {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(handle);
      }
    };
  }

  const handle = setTimeout(() => {
    void task();
  }, 0);
  return () => clearTimeout(handle);
}
