import { Aes256Gcm, CipherSuite, HkdfSha256 } from '@hpke/core';
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519';
import { bytesToBase64 } from '@/src/utils/serialization';
import { ensureKeyCrypto } from './keyCryptoRuntime';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyFingerprint } from './encryptedSnapshot';
import { boundedBase64, keyBytes, keyHex } from './keyEncoding';

const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});
const SUITE = 'HPKE-X25519-HKDF-SHA256-AES256GCM' as const;

export interface EncryptionPair {
  publicKey: string;
  privateKey: Uint8Array;
}
export interface EnvelopeContext {
  purpose: 'device-user-bundle' | 'user-workplace-dek' | 'user-recovery' | 'workplace-dump';
  userId: string;
  recipientKeyId: string;
  deviceId?: string;
  workplaceId?: string;
  keyId?: string;
}
export interface KeyEnvelope {
  format: 'full-frills-key-envelope';
  formatVersion: 1;
  suite: typeof SUITE;
  context: EnvelopeContext;
  encapsulatedKey: string;
  ciphertext: string;
}

function contextBytes(context: EnvelopeContext): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      'full-frills-key-envelope',
      1,
      SUITE,
      context.purpose,
      context.userId,
      context.recipientKeyId,
      context.deviceId ?? null,
      context.workplaceId ?? null,
      context.keyId ?? null,
    ]),
  );
}

/** All hierarchy pairs use independent secure randomness, never another layer's private key. */
export async function generateEncryptionPair(): Promise<EncryptionPair> {
  ensureKeyCrypto();
  return serializePair(await suite.kem.generateKeyPair());
}

async function serializePair(pair: CryptoKeyPair): Promise<EncryptionPair> {
  return {
    publicKey: keyHex(new Uint8Array(await suite.kem.serializePublicKey(pair.publicKey))),
    privateKey: new Uint8Array(await suite.kem.serializePrivateKey(pair.privateKey)),
  };
}

/** Seed reconstruction is exclusively for independently generated recovery recipients. */
export async function recoveryPair(seed: Uint8Array): Promise<EncryptionPair> {
  ensureKeyCrypto();
  if (seed.length !== 32) throw new Error('Invalid recovery seed');
  return serializePair(await suite.kem.deriveKeyPair(seed));
}

export async function publicKeyId(publicKey: string): Promise<string> {
  return keyFingerprint(keyBytes(publicKey));
}

export async function sealKeyEnvelope(
  plaintext: Uint8Array,
  recipientPublicKey: string,
  context: EnvelopeContext,
): Promise<KeyEnvelope> {
  ensureKeyCrypto();
  if (plaintext.length > 4096 || context.recipientKeyId !== (await publicKeyId(recipientPublicKey)))
    throw new Error('Invalid envelope recipient or payload');
  const binding = contextBytes(context);
  const sealed = await suite.seal(
    {
      recipientPublicKey: await suite.kem.deserializePublicKey(keyBytes(recipientPublicKey)),
      info: binding,
    },
    plaintext,
    binding,
  );
  return {
    format: 'full-frills-key-envelope',
    formatVersion: 1,
    suite: SUITE,
    context,
    encapsulatedKey: keyHex(new Uint8Array(sealed.enc)),
    ciphertext: bytesToBase64(new Uint8Array(sealed.ct)),
  };
}

/** Encryption authenticates context, not the sender; callers must pin the intended identity. */
export async function openKeyEnvelope(
  value: unknown,
  privateKey: Uint8Array,
  expected: EnvelopeContext,
): Promise<Uint8Array> {
  ensureKeyCrypto();
  const envelope = parseKeyEnvelope(value);
  if (keyHex(contextBytes(envelope.context)) !== keyHex(contextBytes(expected)))
    throw new Error('Key envelope context mismatch');
  const binding = contextBytes(expected);
  return new Uint8Array(
    await suite.open(
      {
        recipientKey: await suite.kem.deserializePrivateKey(privateKey),
        enc: keyBytes(envelope.encapsulatedKey),
        info: binding,
      },
      boundedBase64(envelope.ciphertext, 4112),
      binding,
    ),
  );
}

export function parseKeyEnvelope(value: unknown): KeyEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid key envelope');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      key =>
        !['format', 'formatVersion', 'suite', 'context', 'encapsulatedKey', 'ciphertext'].includes(
          key,
        ),
    ) ||
    raw.format !== 'full-frills-key-envelope' ||
    raw.formatVersion !== 1 ||
    raw.suite !== SUITE ||
    typeof raw.encapsulatedKey !== 'string' ||
    typeof raw.ciphertext !== 'string' ||
    !raw.context ||
    typeof raw.context !== 'object' ||
    Array.isArray(raw.context)
  )
    throw new Error('Invalid key envelope');
  const context = raw.context as Record<string, unknown>;
  if (
    Object.keys(context).some(
      key =>
        !['purpose', 'userId', 'recipientKeyId', 'deviceId', 'workplaceId', 'keyId'].includes(key),
    ) ||
    !['device-user-bundle', 'user-workplace-dek', 'user-recovery', 'workplace-dump'].includes(
      String(context.purpose),
    ) ||
    typeof context.userId !== 'string' ||
    !context.userId ||
    typeof context.recipientKeyId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(context.recipientKeyId) ||
    ['deviceId', 'workplaceId', 'keyId'].some(
      key => context[key] !== undefined && typeof context[key] !== 'string',
    )
  )
    throw new Error('Invalid key envelope context');
  keyBytes(raw.encapsulatedKey);
  return value as KeyEnvelope;
}

export interface RecoveryCredential {
  format: 'full-frills-recovery-credential';
  formatVersion: 1;
  purpose: 'user-recovery' | 'workplace-dump';
  identityId: string;
  identityKeyId: string;
  recoveryKeyId: string;
  phrase: string;
}

export async function createRecoveryRecipient(
  purpose: RecoveryCredential['purpose'],
  identityId: string,
  identityKeyId: string,
): Promise<{ publicKey: string; credential: RecoveryCredential }> {
  const seed = snapshotCrypto.randomBytes(32);
  let pair: EncryptionPair | undefined;
  try {
    pair = await recoveryPair(seed);
    const recoveryKeyId = await publicKeyId(pair.publicKey);
    const checksum = (
      await keyFingerprint(
        new TextEncoder().encode(
          JSON.stringify([1, purpose, identityId, identityKeyId, recoveryKeyId, keyHex(seed)]),
        ),
      )
    ).slice(7, 19);
    return {
      publicKey: pair.publicKey,
      credential: {
        format: 'full-frills-recovery-credential',
        formatVersion: 1,
        purpose,
        identityId,
        identityKeyId,
        recoveryKeyId,
        phrase: `${keyHex(seed).match(/.{8}/g)!.join('-')}-${checksum}`.toUpperCase(),
      },
    };
  } finally {
    seed.fill(0);
    pair?.privateKey.fill(0);
  }
}

export async function openRecoveryEnvelope(
  credential: RecoveryCredential,
  value: unknown,
  expected: EnvelopeContext,
  identityId: string,
  identityKeyId: string,
): Promise<Uint8Array> {
  if (
    credential.format !== 'full-frills-recovery-credential' ||
    credential.formatVersion !== 1 ||
    credential.purpose !== expected.purpose ||
    credential.identityId !== identityId ||
    credential.identityKeyId !== identityKeyId ||
    credential.recoveryKeyId !== expected.recipientKeyId ||
    typeof credential.phrase !== 'string'
  )
    throw new Error('Recovery credential identity mismatch');
  const encoded = credential.phrase.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[a-f0-9]{76}$/.test(encoded)) throw new Error('Invalid recovery phrase');
  const seed = keyBytes(encoded.slice(0, 64));
  let pair: EncryptionPair | undefined;
  try {
    const checksum = (
      await keyFingerprint(
        new TextEncoder().encode(
          JSON.stringify([
            1,
            credential.purpose,
            identityId,
            identityKeyId,
            credential.recoveryKeyId,
            keyHex(seed),
          ]),
        ),
      )
    ).slice(7, 19);
    if (checksum !== encoded.slice(64)) throw new Error('Recovery phrase checksum mismatch');
    pair = await recoveryPair(seed);
    if ((await publicKeyId(pair.publicKey)) !== expected.recipientKeyId)
      throw new Error('Recovery recipient mismatch');
    return await openKeyEnvelope(value, pair.privateKey, expected);
  } finally {
    seed.fill(0);
    pair?.privateKey.fill(0);
  }
}
