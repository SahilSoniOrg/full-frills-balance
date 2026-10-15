import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';

export async function keyFingerprint(key: Uint8Array): Promise<string> {
  return `sha256:${keyHex(await snapshotCrypto.digest(key))}`;
}

export async function sha256Fingerprint(serialized: string): Promise<string> {
  return keyFingerprint(new TextEncoder().encode(serialized));
}
