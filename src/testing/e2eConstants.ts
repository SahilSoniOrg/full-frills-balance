/** Shared secret passed via Detox `launchArgs` — not for production App Store builds users install from the store. */
export const E2E_AUTH_TOKEN = 'ffb-e2e-v1';

export const E2E_DEFAULT_SEED_USER_NAME = 'E2E User';

export const E2E_DEFAULT_WORKPLACE_LABEL = `${E2E_DEFAULT_SEED_USER_NAME}'s Personal workplace`;

export type E2eUpdateGateMode = 'available' | 'required';
export const E2E_UPDATE_FLOWS = [
  'download',
  'cancel',
  'failure',
  'downloaded',
  'install-failure',
] as const;
export type E2eUpdateFlow = (typeof E2E_UPDATE_FLOWS)[number];

export const E2E_SEED_PROFILES = [
  'journal-details-redesign',
  'onboarded',
  'journal-ready',
  'journal-suggestions',
  'fx-demo',
  'fx-missing-rate',
  'planned-payments',
  'sms-ready',
  'sms-sync',
  'matcher-discovery',
  'evidence-settle-unique',
  'evidence-settle-soft',
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

/** Shared labels for evidence-driven settlement Detox seeds/specs. */
export const E2E_EVIDENCE_SETTLE = {
  planName: 'Evidence Rent',
  amount: 1500,
  smsId: 'e2e-evidence-settle-sms',
  softSmsId: 'e2e-evidence-settle-soft-sms',
  softAmount: 1575,
  accountToken: 'XX9876',
  /** Pending (non-duplicate) SMS used to demo free-form attach-to-journal. */
  pendingAttachSmsId: 'e2e-evidence-attach-pending-sms',
  /** Second pending SMS so one journal can demo multiple linked sources. */
  pendingAttachSmsId2: 'e2e-evidence-attach-pending-sms-2',
  pendingAttachAmount: 420,
  attachTargetDescription: 'Manual Cafe',
} as const;
