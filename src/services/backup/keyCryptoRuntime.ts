/** Public signature verification requires Web Crypto; private-key operations remain native. */
export function ensureKeyCrypto(): void {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues)
    throw new Error('Secure key cryptography is unavailable');
}
