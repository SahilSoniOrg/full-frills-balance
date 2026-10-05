/** Shared secret passed via Detox `launchArgs` — not for production App Store builds users install from the store. */
export const E2E_AUTH_TOKEN = 'ffb-e2e-v1';

export const E2E_DEFAULT_SEED_USER_NAME = 'E2E User';

export const E2E_DEFAULT_WORKPLACE_LABEL = `${E2E_DEFAULT_SEED_USER_NAME}'s Personal workplace`;

export type E2eUpdateGateMode = 'available' | 'required';

export const E2E_SEED_PROFILES = [
  'onboarded',
  'journal-ready',
  'journal-suggestions',
  'fx-demo',
  'fx-missing-rate',
  'planned-payments',
  'sms-ready',
  'sms-sync',
  'merge-edit',
  'picker-ready',
  'first-run-restore',
  'first-run-restore-fx-recovery',
  'bulk-restore',
  'bulk-restore-long-review',
  'bulk-restore-selection',
  'settings-bulk-restore',
] as const;

export type E2eSeedProfile = (typeof E2E_SEED_PROFILES)[number];
