import type { ManualBackupStateStore } from './manualOnlineBackupContracts';

const unavailable = async (): Promise<never> => {
  throw new Error('Online backup state requires native SecureStore and private file storage');
};

/** Web has no accepted online-backup key/storage threat model yet. */
export const manualBackupStateStore: ManualBackupStateStore = {
  loadConsent: unavailable,
  saveConsent: unavailable,
  loadPending: unavailable,
  savePending: unavailable,
  clearPending: unavailable,
};
