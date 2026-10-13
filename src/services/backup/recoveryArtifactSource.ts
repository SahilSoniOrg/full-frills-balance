/** Ciphertext/public metadata only; implementations must never request a recovery phrase.
 * Tests inject a separately retained persistent store. Phase 2 supplies the authorized
 * cloud adapter and verifies signed manifests before returning Workplace keys/data.
 * Device-encrypted local bundles and Device private keys never belong in this store.
 */
export interface RecoveryArtifactSource {
  loadUserRecoveryPackage(userId: string): Promise<unknown | null>;
}
