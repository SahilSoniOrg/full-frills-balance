import { logger } from '@/src/utils/logger';
import { readE2eLaunchConfig } from './e2eLaunchArgs';

let bootstrapPromise: Promise<void> | null = null;

/**
 * Runs once per app process when Detox launch args request reset/seed.
 */
export function ensureE2eBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const config = readE2eLaunchConfig();
      if (!config) {
        return;
      }
      logger.info('[E2E] Bootstrap starting', { config });
      const { executeE2eBootstrap } = await import('./e2eSeed');
      await executeE2eBootstrap(config);
      logger.info('[E2E] Bootstrap complete');
    })().catch(error => {
      bootstrapPromise = null;
      logger.error('[E2E] Bootstrap failed', error);
      throw error;
    });
  }
  return bootstrapPromise;
}
