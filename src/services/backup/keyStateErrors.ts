/** Missing ciphertext is recoverable from the external repository, never by creating keys. */
export class MissingKeyStateError extends Error {
  constructor() {
    super('Missing encrypted key state; use User recovery');
    this.name = 'MissingKeyStateError';
  }
}
