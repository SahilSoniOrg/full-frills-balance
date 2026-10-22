import type { KeyOperationErrorCode } from '@/src/utils/keyOperationError';

export function encryptionRecoveryErrorMessage(code: KeyOperationErrorCode): string {
  switch (code) {
    case 'FFB_KEY_LOCKED':
      return 'Unlock the app and try again. Your existing books and keys have been kept.';
    case 'FFB_KEY_RECOVERY_REQUIRED':
      return 'This Device’s key is unavailable. Use your saved User recovery file and encrypted backup ZIP to restore access.';
    case 'FFB_KEY_INVALID_FILE':
    case 'FFB_KEY_AUTHENTICATION_FAILED':
      return 'These recovery files are invalid, damaged, or do not match. Choose the matching saved files and try again.';
    case 'FFB_KEY_REFERENCE_EXPIRED':
      return 'The selected recovery file or key reference expired. Choose the saved files again.';
    case 'FFB_KEY_CANCELLED':
      return 'The operation was cancelled. Try again; existing books have been kept.';
    case 'FFB_KEY_IDENTITY_MISMATCH':
      return 'The selected files belong to a different User or Workplace key. Choose matching files.';
    case 'FFB_KEY_VAULT_UNAVAILABLE':
      return 'Secure storage is temporarily unavailable. Unlock the Device and try again.';
    case 'FFB_ROW_UNSUPPORTED_COMPRESSION':
      return 'This backup uses a compression format this app does not support. Update the app or choose a supported backup.';
    case 'FFB_ROW_INTEGRITY':
      return 'The encrypted backup failed integrity checks. Choose an unmodified backup file.';
    case 'FFB_KEY_OPERATION_FAILED':
      return 'This step could not finish. Check the files and try again. Existing books and keys have been kept.';
    default:
      return 'This step could not finish. Try again.';
  }
}
