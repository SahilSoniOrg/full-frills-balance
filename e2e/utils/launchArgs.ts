/** Must match `src/testing/e2eConstants.ts` */
export const E2E_AUTH_TOKEN = 'ffb-e2e-v1';

export type E2eSeedProfile =
  | 'onboarded'
  | 'journal-ready'
  | 'fx-demo'
  | 'fx-missing-rate'
  | 'planned-payments'
  | 'sms-ready'
  | 'sms-sync'
  | 'merge-edit'
  | 'picker-ready'
  | 'first-run-restore'
  | 'bulk-restore'
  | 'bulk-restore-selection'
  | 'settings-bulk-restore';
