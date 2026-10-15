import { cryptoProvider } from './cryptoProvider';
import { keyHex } from './keyEncoding';

export async function keyFingerprint(key: Uint8Array): Promise<string> {
  return `sha256:${keyHex(await cryptoProvider.digest(key))}`;
}

export async function sha256Fingerprint(serialized: string): Promise<string> {
  return keyFingerprint(new TextEncoder().encode(serialized));
}
