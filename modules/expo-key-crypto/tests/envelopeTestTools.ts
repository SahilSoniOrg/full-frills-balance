// Standards-library helpers for adversarial inputs and independent wire-format verification.
// No key hierarchy, persistence, recovery coordinator or production import is defined here.
import { Aes256Gcm, CipherSuite, HkdfSha256 } from '@hpke/core';
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519';
import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes } from 'node:crypto';
import { keyFingerprint } from '@/src/services/backup/encryptedSnapshot';
import {
  serializeWorkplaceSnapshot,
  decodeWorkplaceSnapshot,
  type WorkplaceSnapshot,
} from '@/src/services/backup/workplaceSnapshot';
import type { EnvelopeContext, KeyEnvelope } from '@/src/services/backup/keyEnvelopes';
import type { EncryptedSnapshot } from '@/src/services/backup/encryptedSnapshot';
import type { WorkplaceDump } from '@/src/services/backup/workplaceDump';

const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});
const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const binding = (c: EnvelopeContext) =>
  encoded([
    'full-frills-key-envelope',
    1,
    'HPKE-X25519-HKDF-SHA256-AES256GCM',
    c.purpose,
    c.userId,
    c.recipientKeyId,
    c.deviceId ?? null,
    c.workplaceId ?? null,
    c.keyId ?? null,
  ]);
const aad = (e: EncryptedSnapshot) =>
  encoded([
    e.format,
    e.formatVersion,
    e.algorithm,
    e.workplaceId,
    e.snapshotId,
    e.schemaVersion,
    e.keyId,
    'snapshot',
  ]);
export async function sealKeyEnvelope(
  plaintext: Uint8Array,
  recipient: string,
  context: EnvelopeContext,
): Promise<KeyEnvelope> {
  const key = await suite.kem.deserializePublicKey(Buffer.from(recipient, 'hex'));
  const sender = await suite.createSenderContext({
    recipientPublicKey: key,
    info: binding(context),
  });
  return {
    format: 'full-frills-key-envelope',
    formatVersion: 1,
    suite: 'HPKE-X25519-HKDF-SHA256-AES256GCM',
    context,
    encapsulatedKey: Buffer.from(sender.enc).toString('hex'),
    ciphertext: Buffer.from(await sender.seal(plaintext, binding(context))).toString('base64'),
  };
}
export async function encryptWorkplaceSnapshot(
  snapshot: WorkplaceSnapshot,
  key: Uint8Array,
): Promise<EncryptedSnapshot> {
  const envelope: EncryptedSnapshot = {
    format: 'full-frills-encrypted-snapshot',
    formatVersion: 1,
    algorithm: 'AES-256-GCM',
    workplaceId: snapshot.workplace.id,
    snapshotId: randomBytes(16).toString('hex'),
    schemaVersion: snapshot.schemaVersion,
    keyId: await keyFingerprint(key),
    nonce: randomBytes(12).toString('hex'),
    ciphertext: '',
  };
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'hex'));
  cipher.setAAD(aad(envelope));
  return {
    ...envelope,
    ciphertext: Buffer.concat([
      cipher.update(serializeWorkplaceSnapshot(snapshot)),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64'),
  };
}
export function generateUserSigningPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)),
    privateKey: new Uint8Array(privateKey.export({ type: 'pkcs8', format: 'der' })),
  };
}
export async function decryptNativeDump(dump: WorkplaceDump, credential: { phrase: string }) {
  const pair = await suite.kem.deriveKeyPair(
    Buffer.from(credential.phrase.replace(/[\s-]/g, '').slice(0, 64), 'hex'),
  );
  const receiver = await suite.createRecipientContext({
    recipientKey: pair.privateKey,
    enc: Buffer.from(dump.recoveryEnvelope.encapsulatedKey, 'hex'),
    info: binding(dump.recoveryEnvelope.context),
  });
  const key = Buffer.from(
    await receiver.open(
      Buffer.from(dump.recoveryEnvelope.ciphertext, 'base64'),
      binding(dump.recoveryEnvelope.context),
    ),
  );
  try {
    const e = dump.snapshot;
    const ciphertext = Buffer.from(e.ciphertext, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.nonce, 'hex'));
    decipher.setAAD(aad(e));
    decipher.setAuthTag(ciphertext.subarray(-16));
    return decodeWorkplaceSnapshot(
      Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString(
        'utf8',
      ),
    );
  } finally {
    key.fill(0);
  }
}

if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');
