/** HPKE uses Web Crypto for HKDF/AES and its own X25519 implementation. */
export function ensureKeyCrypto(): void {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues)
    throw new Error('Secure key cryptography is unavailable');
}
