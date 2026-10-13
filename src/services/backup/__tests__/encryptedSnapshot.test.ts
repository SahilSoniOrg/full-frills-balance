import { Buffer } from 'node:buffer';
import { resetDatabase } from '@/src/testing/resetDatabase';
import {
  decryptWorkplaceSnapshot,
  encryptWorkplaceSnapshot,
} from '@/src/testing/keyCryptoReference/encryptedSnapshot';
import { snapshotCrypto } from '@/src/testing/keyCryptoReference/snapshotCryptoProvider';
import { seedSnapshotWorkplace, enableTestCrypto } from './snapshotTestHelpers';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
const webCrypto = jest.requireActual<
  typeof import('@/src/testing/keyCryptoReference/snapshotCryptoProvider')
>('@/src/testing/keyCryptoReference/snapshotCryptoProvider').snapshotCrypto;
const nativeCrypto = jest.requireActual<
  typeof import('@/src/testing/keyCryptoReference/snapshotCryptoProvider')
>('@/src/testing/keyCryptoReference/snapshotCryptoProvider.native-reference').snapshotCrypto;
beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
});

it('encrypts payloads without recovery material or readable keys, and uses fresh nonces', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const dek = snapshotCrypto.randomBytes(32);
  const envelope = await encryptWorkplaceSnapshot(snapshot, dek);
  expect(JSON.stringify(envelope)).not.toContain('Private books');
  expect(JSON.stringify(envelope)).not.toContain(Buffer.from(dek).toString('hex'));
  expect(envelope).not.toHaveProperty('recovery');
  expect(envelope).not.toHaveProperty('keyGeneration');
  expect(await decryptWorkplaceSnapshot(envelope, dek)).toEqual(snapshot);
  const second = await encryptWorkplaceSnapshot(snapshot, dek);
  expect(second.nonce).not.toBe(envelope.nonce);
  expect(second.snapshotId).not.toBe(envelope.snapshotId);
  expect(second.keyId).toBe(envelope.keyId);
});
it('rejects different keys and tampering with every authenticated routing field', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const dek = snapshotCrypto.randomBytes(32);
  const envelope = await encryptWorkplaceSnapshot(snapshot, dek);
  await expect(
    decryptWorkplaceSnapshot(envelope, snapshotCrypto.randomBytes(32)),
  ).rejects.toThrow();
  for (const patch of [
    { workplaceId: 'other' },
    { keyId: 'sha256:' + '00'.repeat(32) },
    { schemaVersion: envelope.schemaVersion + 1 },
    { snapshotId: '00'.repeat(16) },
    { nonce: '00'.repeat(12) },
  ])
    await expect(decryptWorkplaceSnapshot({ ...envelope, ...patch }, dek)).rejects.toThrow();
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 1;
  await expect(
    decryptWorkplaceSnapshot({ ...envelope, ciphertext: bytes.toString('base64') }, dek),
  ).rejects.toThrow();
});
it('rejects legacy envelopes, unknown fields, malformed encodings, and unsupported algorithms', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const dek = snapshotCrypto.randomBytes(32);
  const envelope = await encryptWorkplaceSnapshot(snapshot, dek);
  for (const patch of [
    { algorithm: 'AES-CBC' },
    { formatVersion: 1 },
    { nonce: '00' },
    { ciphertext: 'invalid?' },
    { recovery: {} },
    { keyGeneration: 1 },
    { plaintext: 'secret' },
  ])
    await expect(decryptWorkplaceSnapshot({ ...envelope, ...patch }, dek)).rejects.toThrow();
});
it('matches the AES-256-GCM known-answer vector and interoperates between adapters', async () => {
  const key = new Uint8Array(32),
    nonce = new Uint8Array(12),
    aad = new Uint8Array(),
    plaintext = new Uint8Array(16);
  const expected = 'cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919';
  const web = await webCrypto.encrypt(key, nonce, aad, plaintext),
    native = await nativeCrypto.encrypt(key, nonce, aad, plaintext);
  expect(Buffer.from(web).toString('hex')).toBe(expected);
  expect(Buffer.from(native).toString('hex')).toBe(expected);
  expect(await nativeCrypto.decrypt(key, nonce, aad, web)).toEqual(plaintext);
  expect(await webCrypto.decrypt(key, nonce, aad, native)).toEqual(plaintext);
});
