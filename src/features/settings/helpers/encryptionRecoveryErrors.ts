import type { KeyOperationErrorCode } from '@/src/utils/keyOperationError';

export function encryptionRecoveryErrorMessage(code: KeyOperationErrorCode): string {
  switch (code) {
    case 'FFB_KEY_LOCKED':
      return 'Unlock the app and try again. Your existing books and keys have been kept.';
    case 'FFB_KEY_RECOVERY_REQUIRED':
      return 'This Device’s key is unavailable. Choose your saved User recovery secret and encrypted package to restore access.';
    case 'FFB_KEY_INVALID_FILE':
    case 'FFB_KEY_AUTHENTICATION_FAILED':
      return 'These recovery files are invalid, damaged, or do not match. Choose the matching saved files and try again.';
    case 'FFB_KEY_REFERENCE_EXPIRED':
      return 'The selected recovery file or key reference expired. Choose the saved files again.';
    case 'FFB_KEY_CANCELLED':
      return 'Recovery was cancelled. Choose your saved files and try again; existing books have been kept.';
    case 'FFB_KEY_WORKPLACE_COLLISION':
      return 'This backup conflicts with existing local books. Recovery will not overwrite them. Export your current books first, then recover on another Device or a fresh installation with your saved recovery files.';
    case 'FFB_KEY_IDENTITY_MISMATCH':
      return 'The selected files belong to a different User or Workplace key. Choose the matching files or use a fresh installation.';
    case 'FFB_KEY_PACKAGE_UNAVAILABLE':
      return 'The unfinished encrypted package is unavailable. Abandon it and prepare a new package, or choose a saved copy.';
    case 'FFB_KEY_BUDGET_EXHAUSTED':
      return 'This Workplace has reached its encryption limit. Existing encrypted backups can still be opened.';
    case 'FFB_KEY_OPERATION_FAILED':
      return 'This step could not finish. Check the files and try again. Existing books and keys have been kept.';
  }
}
