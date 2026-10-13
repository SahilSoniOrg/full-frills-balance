if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');

/** Web/Node implementation. Absence of secure crypto is an error, never a random-number fallback. */
function secureCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Secure snapshot cryptography is unavailable');
  }
  return globalThis.crypto;
}

export const snapshotCrypto = {
  randomBytes(length: number): Uint8Array {
    return secureCrypto().getRandomValues(new Uint8Array(length));
  },
  async digest(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      await secureCrypto().subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
    );
  },
  async encrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    bytes: Uint8Array,
  ): Promise<Uint8Array> {
    const crypto = secureCrypto();
    const imported = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(key).buffer,
      'AES-GCM',
      false,
      ['encrypt'],
    );
    return new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(nonce).buffer,
          additionalData: new Uint8Array(aad).buffer,
          tagLength: 128,
        },
        imported,
        new Uint8Array(bytes).buffer,
      ),
    );
  },
  async decrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    bytes: Uint8Array,
  ): Promise<Uint8Array> {
    const crypto = secureCrypto();
    const imported = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(key).buffer,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(nonce).buffer,
          additionalData: new Uint8Array(aad).buffer,
          tagLength: 128,
        },
        imported,
        new Uint8Array(bytes).buffer,
      ),
    );
  },
};
