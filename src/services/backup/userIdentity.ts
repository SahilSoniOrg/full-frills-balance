import { ensureKeyCrypto } from './keyCryptoRuntime';
import { keyBytes, keyHex } from './keyEncoding';
import { snapshotFingerprint } from './encryptedSnapshot';

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
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid User public identity');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).sort().join(',') !==
      'encryptionAlgorithm,encryptionPublicKey,format,formatVersion,signingAlgorithm,signingPublicKey,userId' ||
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

export async function generateUserSigningPair(): Promise<{
  publicKey: string;
  privateKey: Uint8Array;
}> {
  ensureKeyCrypto();
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return {
    publicKey: keyHex(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    privateKey: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
  };
}

/** Possession test only. Online signatures/manifests remain a separate protocol gate. */
export async function verifyUserSigningPair(
  privateKey: Uint8Array,
  publicKey: string,
): Promise<void> {
  ensureKeyCrypto();
  const secret = await crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(privateKey).buffer,
    'Ed25519',
    false,
    ['sign'],
  );
  const publicPart = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes(publicKey)).buffer,
    'Ed25519',
    false,
    ['verify'],
  );
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const signature = await crypto.subtle.sign('Ed25519', secret, challenge);
    if (!(await crypto.subtle.verify('Ed25519', publicPart, signature, challenge)))
      throw new Error('User signing key pair mismatch');
  } finally {
    challenge.fill(0);
  }
}

export async function signUserMessage(
  privateKey: Uint8Array,
  message: Uint8Array,
): Promise<string> {
  ensureKeyCrypto();
  const key = await crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(privateKey).buffer,
    'Ed25519',
    false,
    ['sign'],
  );
  return keyHex(
    new Uint8Array(await crypto.subtle.sign('Ed25519', key, new Uint8Array(message).buffer)),
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
    throw new Error('Recovery package signature mismatch');
}
