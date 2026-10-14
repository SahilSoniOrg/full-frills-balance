import { KeyOperationError } from '@/src/utils/keyOperationError';

/** Missing ciphertext is recoverable from the external repository, never by creating keys. */
export class MissingKeyStateError extends KeyOperationError {
  constructor() {
    super('FFB_KEY_RECOVERY_REQUIRED', 'Missing encrypted key state; use User recovery');
    this.name = 'MissingKeyStateError';
  }
}
