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

/** Fails closed at every destructive E2E boundary. */
export function assertE2eHarnessEnabled(): void {
  if (!isE2eHarnessEnabled()) {
    throw new Error('[E2E] Harness capability is disabled for this build');
  }
}
