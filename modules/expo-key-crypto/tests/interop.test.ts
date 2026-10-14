import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import { decryptNativeDump } from './envelopeTestTools';
import { memoryKeyHierarchy, closeNativeHost } from './nativeTestContext';
import { createWorkplaceDump } from '@/src/services/backup/workplaceDump';
import {
  createLocalRecoveryPackage,
  verifyLocalRecoveryPackage,
} from '@/src/services/backup/localRecoveryPackage';
import {
  enableTestCrypto,
  seedSnapshotWorkplace,
} from '@/src/services/backup/__tests__/snapshotTestHelpers';
import { resetDatabase } from '@/src/testing/resetDatabase';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
let context: ReturnType<typeof memoryKeyHierarchy>;
beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
  context = memoryKeyHierarchy();
});
afterEach(closeNativeHost);
const host = {
  execute: (operation: string, request: unknown) => context.host.execute(operation, request),
};
function target() {
  const t = memoryKeyHierarchy();
  return { ...t, records: t.ciphertext, forbidden: t.crypto.importCredential };
}
async function source() {
  const fixture = await seedSnapshotWorkplace();
  const context = target();
  const userCredential = await context.hierarchy.beginUser('native-alice-😀', 'native-phone');
  const identity = await context.hierarchy.confirmUserRecovery(
    userCredential.identityId,
    'native-phone',
    userCredential,
  );
  const workplaceCredential = await context.hierarchy.enrollWorkplace(
    identity,
    fixture.workplaceId,
    'local-upgrade',
  );
  await context.hierarchy.confirmWorkplaceRecovery(
    identity,
    fixture.workplaceId,
    workplaceCredential,
  );
  return { ...fixture, ...context, identity, userCredential, workplaceCredential };
}
function noRawKeys(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    expect(['privateKey', 'signingPrivateKey', 'phrase', 'dek']).not.toContain(key);
    noRawKeys(item);
  }
}
it('creates, unwraps, encrypts, decrypts and signs in the real native core without calling a JS vault', async () => {
  const s = await source();
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  expect(await s.hierarchy.decryptSnapshot(s.identity, s.workplaceId, envelope)).toEqual(
    s.snapshot,
  );
  const pack = await createLocalRecoveryPackage(s.hierarchy, s.identity, s.workplaceId, envelope);
  await expect(verifyLocalRecoveryPackage(pack, s.identity)).resolves.toEqual(pack);
  for (const value of [s.userCredential, s.workplaceCredential, pack, ...s.records.values()])
    noRawKeys(value);
  expect(s.userCredential.format).toBe('full-frills-recovery-handle');
  expect(s.forbidden).not.toHaveBeenCalled();
});
it('an independent standards-based consumer decrypts a native-created emergency dump', async () => {
  const s = await source();
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  const credential = (await host.execute('test.exportCredential', s.workplaceCredential)) as {
    phrase: string;
  };
  const keys = await s.hierarchy.exportWorkplaceKeys(s.identity, s.workplaceId);
  expect(await decryptNativeDump(createWorkplaceDump(keys, envelope), credential)).toEqual(
    s.snapshot,
  );
});
it('rejects a tampered signature, ciphertext, context and opaque recovery handle', async () => {
  const s = await source();
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  const pack = await createLocalRecoveryPackage(s.hierarchy, s.identity, s.workplaceId, envelope);
  await expect(
    verifyLocalRecoveryPackage({ ...pack, signature: '00'.repeat(64) }, s.identity),
  ).rejects.toThrow();
  for (const altered of [
    { ...envelope, workplaceId: 'wrong' },
    { ...envelope, nonce: '00'.repeat(12) },
    {
      ...envelope,
      ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`,
    },
  ])
    await expect(s.hierarchy.decryptSnapshot(s.identity, s.workplaceId, altered)).rejects.toThrow();
  await expect(
    s.hierarchy.confirmUserRecovery(s.identity.userId, s.identity.registeredDeviceId, {
      ...s.userCredential,
      handle: '00'.repeat(32),
    }),
  ).rejects.toThrow();
});
it('validates native-exported recovery-file secrets and rejects altered checksums or metadata', async () => {
  const s = await source();
  const saved = (await host.execute('test.exportCredential', s.userCredential)) as {
    phrase: string;
  };
  const phrase = saved.phrase;
  const altered = `${phrase.slice(0, -1)}${phrase.endsWith('0') ? '1' : '0'}`;
  for (const credential of [
    { ...saved, phrase: altered },
    { ...saved, identityId: 'another-user' },
    { ...saved, purpose: 'workplace-dump' },
    { ...saved, recoveryKeyId: `sha256:${'00'.repeat(32)}` },
  ])
    await expect(host.execute('test.importCredential', { credential })).rejects.toThrow();
  const handle = (await host.execute('test.importCredential', {
    credential: saved,
  })) as RecoveryCredential;
  noRawKeys(handle);
  await expect(
    s.hierarchy.confirmUserRecovery(s.identity.userId, s.identity.registeredDeviceId, handle),
  ).resolves.toEqual(s.identity);
});
it('native app-lock enforcement refuses decryption even when a caller bypasses the JS policy check', async () => {
  const s = await source();
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  await host.execute('test.setAllowed', { allowed: false });
  await expect(s.hierarchy.decryptSnapshot(s.identity, s.workplaceId, envelope)).rejects.toThrow();
  await host.execute('test.setAllowed', { allowed: true });
  expect(await s.hierarchy.decryptSnapshot(s.identity, s.workplaceId, envelope)).toEqual(
    s.snapshot,
  );
});
it('the native operation dispatcher has no generic decrypt-envelope or raw-key export operation', async () => {
  const s = await source();
  for (const operation of ['exportPrivateKey', 'openKeyEnvelope', 'credentialFile', 'getDEK'])
    await expect(
      host.execute(operation, {
        userId: s.identity.userId,
        deviceId: s.identity.registeredDeviceId,
      }),
    ).rejects.toThrow();
});

it('invalidates unleased recovery handles natively across lock/unlock without JS cleanup', async () => {
  const credential = await context.hierarchy.beginUser('lock-test', 'device');
  await host.execute('test.setAllowed', { allowed: false });
  await host.execute('test.setAllowed', { allowed: true });
  await expect(host.execute('test.exportCredential', credential)).rejects.toMatchObject({
    code: 'FFB_KEY_REFERENCE_EXPIRED',
  });
});
