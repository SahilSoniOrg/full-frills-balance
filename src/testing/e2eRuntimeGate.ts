import Constants from 'expo-constants';

type E2eExtra = {
  e2eHarnessEnabled?: unknown;
};

function hasE2eBuildCapability(): boolean {
  const extra = Constants.expoConfig?.extra as E2eExtra | undefined;
  return extra?.e2eHarnessEnabled === true;
}

/** True only for a bundle explicitly built for the E2E harness. */
export function isE2eHarnessEnabled(): boolean {
  return process.env.EXPO_PUBLIC_E2E === '1' && hasE2eBuildCapability();
}

/**
 * True when an authenticated E2E launch is active (Detox / seeded harness run).
 * `EXPO_PUBLIC_E2E=1` alone (e.g. `.env.local` for harness-capable debug builds)
 * must not block production-like network paths such as FX.
 *
 * Lazy-requires launch args to avoid a cycle: e2eLaunchArgs → this module.
 */
export function isE2eOfflineMode(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readE2eLaunchConfig } = require('./e2eLaunchArgs') as typeof import('./e2eLaunchArgs');
  return readE2eLaunchConfig() != null;
}

/** Fails closed at every destructive E2E boundary. */
export function assertE2eHarnessEnabled(): void {
  if (!isE2eHarnessEnabled()) {
    throw new Error('[E2E] Harness capability is disabled for this build');
  }
}
