import { closeNativeHost, enrolledKeyHierarchy } from './nativeTestContext';
import { resetDatabase } from '@/src/testing/resetDatabase';
import {
  seedSnapshotWorkplace,
  enableTestCrypto,
} from '@/src/services/backup/__tests__/snapshotTestHelpers';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
});
afterEach(closeNativeHost);
it('encrypts without readable keys/recovery material and uses fresh nonces', async () => {
  const { snapshot, workplaceId } = await seedSnapshotWorkplace();
  const s = await enrolledKeyHierarchy(workplaceId);
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, workplaceId, snapshot);
  expect(JSON.stringify(envelope)).not.toContain('Private books');
  expect(envelope).not.toHaveProperty('recovery');
  expect(envelope).not.toHaveProperty('keyGeneration');
  expect(await s.hierarchy.decryptSnapshot(s.identity, workplaceId, envelope)).toEqual(snapshot);
  const second = await s.hierarchy.encryptSnapshot(s.identity, workplaceId, snapshot);
  expect(second.nonce).not.toBe(envelope.nonce);
  expect(second.snapshotId).not.toBe(envelope.snapshotId);
  expect(second.keyId).toBe(envelope.keyId);
});
it('rejects different key pins and tampering with every authenticated routing field', async () => {
  const { snapshot, workplaceId } = await seedSnapshotWorkplace();
  const s = await enrolledKeyHierarchy(workplaceId);
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, workplaceId, snapshot);
  for (const patch of [
    { workplaceId: 'other' },
    { keyId: 'sha256:' + '00'.repeat(32) },
    { schemaVersion: envelope.schemaVersion + 1 },
    { snapshotId: '00'.repeat(16) },
    { nonce: '00'.repeat(12) },
  ])
    await expect(
      s.hierarchy.decryptSnapshot(s.identity, workplaceId, { ...envelope, ...patch }),
    ).rejects.toThrow();
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  ciphertext[0] ^= 1;
  await expect(
    s.hierarchy.decryptSnapshot(s.identity, workplaceId, {
      ...envelope,
      ciphertext: ciphertext.toString('base64'),
    }),
  ).rejects.toThrow();
});
it('rejects legacy envelopes, unknown fields, malformed encodings and unsupported algorithms', async () => {
  const { snapshot, workplaceId } = await seedSnapshotWorkplace();
  const s = await enrolledKeyHierarchy(workplaceId);
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, workplaceId, snapshot);
  for (const patch of [
    { algorithm: 'AES-CBC' },
    { formatVersion: 1 },
    { nonce: '00' },
    { ciphertext: 'invalid?' },
    { recovery: {} },
    { keyGeneration: 1 },
    { plaintext: 'secret' },
  ])
    await expect(
      s.hierarchy.decryptSnapshot(s.identity, workplaceId, { ...envelope, ...patch }),
    ).rejects.toThrow();
});
it('matches the AES-256-GCM known-answer vector in the actual shared native core', async () => {
  const s = await enrolledKeyHierarchy();
  expect(
    await s.host.execute('test.aes', {
      key: '00'.repeat(32),
      nonce: '00'.repeat(12),
      plaintext: '00'.repeat(16),
    }),
  ).toBe('cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919');
});
