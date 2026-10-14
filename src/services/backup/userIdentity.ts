import { parseObject, assertExactKeys } from '@/src/utils/strictObject';
import { ensureKeyCrypto } from './keyCryptoRuntime';
import { keyBytes } from './keyEncoding';
import { snapshotFingerprint } from './encryptedSnapshot';
import { KeyOperationError } from '@/src/utils/keyOperationError';

/** The initial identity includes both key roles, before any credentials are distributed. */
export interface UserPublicIdentity {
  format: 'full-frills-user-identity';
  formatVersion: 1;
  userId: string;
  encryptionAlgorithm: 'X25519';
  encryptionPublicKey: string;
  signingAlgorithm: 'Ed25519';
  signingPublicKey: string;
}

export function parseUserPublicIdentity(value: unknown): UserPublicIdentity {
  const raw = parseObject(value, 'Invalid User public identity');
  assertExactKeys(
    raw,
    [
      'encryptionAlgorithm',
      'encryptionPublicKey',
      'format',
      'formatVersion',
      'signingAlgorithm',
      'signingPublicKey',
      'userId',
    ],
    'Unsupported User public identity',
  );
  if (
    raw.format !== 'full-frills-user-identity' ||
    raw.formatVersion !== 1 ||
    raw.encryptionAlgorithm !== 'X25519' ||
    raw.signingAlgorithm !== 'Ed25519' ||
    typeof raw.userId !== 'string' ||
    !raw.userId.trim() ||
    typeof raw.encryptionPublicKey !== 'string' ||
    typeof raw.signingPublicKey !== 'string'
  )
    throw new Error('Unsupported User public identity');
  keyBytes(raw.encryptionPublicKey);
  keyBytes(raw.signingPublicKey);
  return value as UserPublicIdentity;
}

export async function userIdentityFingerprint(value: UserPublicIdentity): Promise<string> {
  const identity = parseUserPublicIdentity(value);
  return snapshotFingerprint(
    JSON.stringify([
      identity.format,
      identity.formatVersion,
      identity.userId,
      identity.encryptionAlgorithm,
      identity.encryptionPublicKey,
      identity.signingAlgorithm,
      identity.signingPublicKey,
    ]),
  );
}

export async function verifyUserMessage(
  publicKey: string,
  message: Uint8Array,
  signature: string,
): Promise<void> {
  ensureKeyCrypto();
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes(publicKey)).buffer,
    'Ed25519',
    false,
    ['verify'],
  );
  if (
    !(await crypto.subtle.verify(
      'Ed25519',
      key,
      new Uint8Array(keyBytes(signature, 64)).buffer,
      new Uint8Array(message).buffer,
    ))
  )
    throw new KeyOperationError(
      'FFB_KEY_AUTHENTICATION_FAILED',
      'Recovery package signature mismatch',
    );
}
