import { InteractionManager } from 'react-native';

/**
 * Executes a task after interactions have finished, or when the system is idle.
 * Uses requestIdleCallback where available (modern React Native / Web),
 * falling back to InteractionManager.runAfterInteractions.
 */
export function runAfterInteractions(task: () => void | Promise<void>, timeout: number = 2500) {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => task(), { timeout });
    return;
  }

  InteractionManager.runAfterInteractions(task);
}

/**
 * Standard delay helper
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
