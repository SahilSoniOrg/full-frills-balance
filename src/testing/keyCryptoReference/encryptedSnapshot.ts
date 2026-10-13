import { bytesToBase64 } from '@/src/utils/serialization';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex, keyBytes, boundedBase64 } from '@/src/services/backup/keyEncoding';
import {
  decodeWorkplaceSnapshot,
  serializeWorkplaceSnapshot,
  MAX_SNAPSHOT_BYTES,
  type WorkplaceSnapshot,
} from '@/src/services/backup/workplaceSnapshot';

if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');

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

function aad(envelope: Omit<EncryptedSnapshot, 'nonce' | 'ciphertext'>): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      envelope.format,
      envelope.formatVersion,
      envelope.algorithm,
      envelope.workplaceId,
      envelope.snapshotId,
      envelope.schemaVersion,
      envelope.keyId,
      'snapshot',
    ]),
  );
}

/** The caller reserves its durable nonce budget first; DEK bytes never leave memory. */
export async function encryptWorkplaceSnapshot(
  snapshot: WorkplaceSnapshot,
  dek: Uint8Array,
): Promise<EncryptedSnapshot> {
  if (dek.length !== 32) throw new Error('Invalid Workplace DEK');
  const plaintext = new TextEncoder().encode(serializeWorkplaceSnapshot(snapshot));
  try {
    const routing: Omit<EncryptedSnapshot, 'nonce' | 'ciphertext'> = {
      format: 'full-frills-encrypted-snapshot',
      formatVersion: 2,
      algorithm: 'AES-256-GCM',
      workplaceId: snapshot.workplace.id,
      snapshotId: keyHex(snapshotCrypto.randomBytes(16)),
      schemaVersion: snapshot.schemaVersion,
      keyId: await keyFingerprint(dek),
    };
    const nonce = snapshotCrypto.randomBytes(12);
    return {
      ...routing,
      nonce: keyHex(nonce),
      ciphertext: bytesToBase64(await snapshotCrypto.encrypt(dek, nonce, aad(routing), plaintext)),
    };
  } finally {
    plaintext.fill(0);
  }
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

export async function decryptWorkplaceSnapshot(
  value: unknown,
  dek: Uint8Array,
): Promise<WorkplaceSnapshot> {
  const envelope = parseEncryptedSnapshotEnvelope(value);
  if (dek.length !== 32 || (await keyFingerprint(dek)) !== envelope.keyId)
    throw new Error('Workplace DEK identity mismatch');
  const plaintext = await snapshotCrypto.decrypt(
    dek,
    keyBytes(envelope.nonce, 12),
    aad(envelope),
    boundedBase64(envelope.ciphertext, MAX_SNAPSHOT_BYTES + 16),
  );
  try {
    const snapshot = decodeWorkplaceSnapshot(
      new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
    );
    if (
      snapshot.workplace.id !== envelope.workplaceId ||
      snapshot.schemaVersion !== envelope.schemaVersion
    )
      throw new Error('Encrypted snapshot identity mismatch');
    return snapshot;
  } finally {
    plaintext.fill(0);
  }
}
