import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex, keyBytes } from './keyEncoding';
/** Payload only. Member and recovery DEK envelopes belong to the key manifest. */
export interface EncryptedSnapshot {
  readonly format: 'full-frills-encrypted-snapshot';
  readonly formatVersion: 2;
  readonly algorithm: 'AES-256-GCM';
  readonly workplaceId: string;
  readonly snapshotId: string;
  readonly schemaVersion: number;
  readonly keyId: string;
  readonly nonce: string;
  readonly ciphertext: string;
}

export async function keyFingerprint(key: Uint8Array): Promise<string> {
  return `sha256:${keyHex(await snapshotCrypto.digest(key))}`;
}

export async function snapshotFingerprint(serialized: string): Promise<string> {
  return keyFingerprint(new TextEncoder().encode(serialized));
}

export function parseEncryptedSnapshotEnvelope(value: unknown): EncryptedSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid encrypted snapshot envelope');
  const envelope = value as Record<string, unknown>;
  const keys = [
    'format',
    'formatVersion',
    'algorithm',
    'workplaceId',
    'snapshotId',
    'schemaVersion',
    'keyId',
    'nonce',
    'ciphertext',
  ];
  if (
    Object.keys(envelope).some(key => !keys.includes(key)) ||
    envelope.format !== 'full-frills-encrypted-snapshot' ||
    envelope.formatVersion !== 2 ||
    envelope.algorithm !== 'AES-256-GCM' ||
    typeof envelope.workplaceId !== 'string' ||
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(envelope.workplaceId) ||
    typeof envelope.snapshotId !== 'string' ||
    !/^[a-f0-9]{32}$/.test(envelope.snapshotId) ||
    typeof envelope.schemaVersion !== 'number' ||
    !Number.isSafeInteger(envelope.schemaVersion) ||
    envelope.schemaVersion < 1 ||
    typeof envelope.keyId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(envelope.keyId) ||
    typeof envelope.nonce !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  )
    throw new Error('Invalid encrypted snapshot envelope');
  keyBytes(envelope.nonce, 12);
  return value as EncryptedSnapshot;
}
