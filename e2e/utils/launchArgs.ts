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
  | 'first-run-restore-fx-recovery'
  | 'bulk-restore'
  | 'bulk-restore-long-review'
  | 'bulk-restore-selection'
  | 'settings-bulk-restore';
