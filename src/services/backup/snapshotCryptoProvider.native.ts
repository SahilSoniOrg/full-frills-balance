import QuickCrypto from 'react-native-quick-crypto';

/** Native AES-GCM wire format matches Web Crypto: ciphertext followed by the 16-byte tag. */
export const snapshotCrypto = {
  randomBytes(length: number): Uint8Array {
    return new Uint8Array(QuickCrypto.randomBytes(length));
  },
  async digest(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      QuickCrypto.createHash('sha256').update(QuickCrypto.Buffer.from(bytes)).digest(),
    );
  },
  async encrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    bytes: Uint8Array,
  ): Promise<Uint8Array> {
    const cipher = QuickCrypto.createCipheriv(
      'aes-256-gcm',
      QuickCrypto.Buffer.from(key),
      QuickCrypto.Buffer.from(nonce),
      { authTagLength: 16 },
    );
    cipher.setAAD(QuickCrypto.Buffer.from(aad));
    return new Uint8Array(
      QuickCrypto.Buffer.concat([
        cipher.update(QuickCrypto.Buffer.from(bytes)),
        cipher.final(),
        cipher.getAuthTag(),
      ]),
    );
  },
  async decrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    bytes: Uint8Array,
  ): Promise<Uint8Array> {
    if (bytes.length < 16) throw new Error('Invalid encrypted snapshot');
    const decipher = QuickCrypto.createDecipheriv(
      'aes-256-gcm',
      QuickCrypto.Buffer.from(key),
      QuickCrypto.Buffer.from(nonce),
      { authTagLength: 16 },
    );
    decipher.setAAD(QuickCrypto.Buffer.from(aad));
    decipher.setAuthTag(QuickCrypto.Buffer.from(bytes.subarray(bytes.length - 16)));
    return new Uint8Array(
      QuickCrypto.Buffer.concat([
        decipher.update(QuickCrypto.Buffer.from(bytes.subarray(0, -16))),
        decipher.final(),
      ]),
    );
  },
};
