import { InteractionManager } from 'react-native';

/**
 * Executes a task after interactions have finished, or when the system is idle.
 * Uses requestIdleCallback where available (modern React Native / Web),
 * falling back to InteractionManager.runAfterInteractions.
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

  const handle = InteractionManager.runAfterInteractions(task);
  return () => {
    handle.cancel();
  };
}

/**
 * Standard delay helper
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
