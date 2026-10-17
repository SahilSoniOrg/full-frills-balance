export const KEY_OPERATION_ERROR_CODES = [
  'FFB_KEY_LOCKED',
  'FFB_KEY_RECOVERY_REQUIRED',
  'FFB_KEY_INVALID_FILE',
  'FFB_KEY_AUTHENTICATION_FAILED',
  'FFB_KEY_REFERENCE_EXPIRED',
  'FFB_KEY_CANCELLED',
  'FFB_KEY_OPERATION_FAILED',
  'FFB_KEY_IDENTITY_MISMATCH',
  'FFB_KEY_VAULT_UNAVAILABLE',
  'FFB_ROW_TOO_LARGE',
  'FFB_ROW_UNKNOWN_DICT',
  'FFB_ROW_INTEGRITY',
] as const;
export type KeyOperationErrorCode = (typeof KEY_OPERATION_ERROR_CODES)[number];

export class KeyOperationError extends Error {
  constructor(
    readonly code: KeyOperationErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'KeyOperationError';
  }
}

/** Missing ciphertext is recoverable from the external repository, never by creating keys. */
export class MissingKeyStateError extends KeyOperationError {
  constructor() {
    super('FFB_KEY_RECOVERY_REQUIRED', 'Missing encrypted key state; use User recovery');
    this.name = 'MissingKeyStateError';
  }
}

/** Accept only known codes. Native wrappers may decorate messages; never expose their text. */
export function keyOperationErrorCode(error: unknown): KeyOperationErrorCode {
  if (!error || typeof error !== 'object') return 'FFB_KEY_OPERATION_FAILED';
  if ('code' in error) {
    const known = KEY_OPERATION_ERROR_CODES.find(code => code === error.code);
    if (known) return known;
  }
  if ('message' in error && typeof error.message === 'string') {
    const code = error.message.match(/\bFFB_(?:KEY|ROW)_[A-Z_]+\b/)?.[0];
    const known = KEY_OPERATION_ERROR_CODES.find(value => value === code);
    if (known) return known;
  }
  return 'FFB_KEY_OPERATION_FAILED';
}
