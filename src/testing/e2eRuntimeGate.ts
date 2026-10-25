import { assertE2eHarnessEnabled, isE2eHarnessEnabled } from './e2eHarnessCapability';

export { assertE2eHarnessEnabled, isE2eHarnessEnabled };

/**
 * True when an authenticated E2E launch is active (Detox / seeded harness run).
 * `EXPO_PUBLIC_E2E=1` alone (e.g. `.env.local` for harness-capable debug builds)
 * must not block production-like network paths such as FX.
 *
 * Lazy-requires launch args to avoid a cycle: e2eLaunchArgs → harness capability
 * (not this module).
 */
export function isE2eOfflineMode(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readE2eLaunchConfig } = require('./e2eLaunchArgs') as typeof import('./e2eLaunchArgs');
  return readE2eLaunchConfig() != null;
}
