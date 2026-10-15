// Standards-library helpers for adversarial inputs and independent wire-format verification.
// No key hierarchy, persistence, recovery coordinator or production import is defined here.
import { Aes256Gcm, CipherSuite, HkdfSha256 } from '@hpke/core';
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519';
import { generateKeyPairSync } from 'node:crypto';
import type { EnvelopeContext, KeyEnvelope } from '@/src/services/backup/keyEnvelopes';

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
export function generateUserSigningPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)),
    privateKey: new Uint8Array(privateKey.export({ type: 'pkcs8', format: 'der' })),
  };
}
if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');
