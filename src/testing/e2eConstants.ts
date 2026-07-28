/** Shared secret passed via Detox `launchArgs` — not for production App Store builds users install from the store. */
export const E2E_AUTH_TOKEN = 'ffb-e2e-v1';

export type E2eSeedProfile = 'onboarded' | 'journal-ready' | 'planned-payments';

export const E2E_SEED_PROFILES: readonly E2eSeedProfile[] = [
  'onboarded',
  'journal-ready',
  'planned-payments',
] as const;
