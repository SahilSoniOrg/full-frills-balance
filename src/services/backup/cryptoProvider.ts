/** Web/Node implementation. Absence of secure crypto is an error, never a random-number fallback. */
function secureCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Secure cryptography is unavailable');
  }
  return globalThis.crypto;
}

export const cryptoProvider = {
  randomBytes(length: number): Uint8Array {
    return secureCrypto().getRandomValues(new Uint8Array(length));
  },
  async digest(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      await secureCrypto().subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
    );
  },
};
