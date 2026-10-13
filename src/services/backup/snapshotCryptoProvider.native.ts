import QuickCrypto from 'react-native-quick-crypto';

/** Public randomness and hashes only. Secret-bearing AES operations live in ExpoKeyCrypto. */
export const snapshotCrypto = {
  randomBytes(length: number): Uint8Array {
    return new Uint8Array(QuickCrypto.randomBytes(length));
  },
  async digest(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      QuickCrypto.createHash('sha256').update(QuickCrypto.Buffer.from(bytes)).digest(),
    );
  },
};
