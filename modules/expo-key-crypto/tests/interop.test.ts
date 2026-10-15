import { webcrypto } from 'node:crypto';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import { memoryKeyHierarchy, closeNativeHost } from './nativeTestContext';
import { parseLocalUser, userScope } from '@/src/services/backup/keyHierarchyRecords';
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
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  await resetDatabase();
  context = memoryKeyHierarchy();
});
afterEach(closeNativeHost);
const host = {
  execute: (operation: string, request: unknown) => context.host.execute(operation, request),
};
function noRawKeys(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    expect(['privateKey', 'signingPrivateKey', 'phrase', 'dek']).not.toContain(key);
    noRawKeys(item);
  }
}
async function source() {
  const userCredential = await context.hierarchy.beginUser('native-alice-😀', 'native-phone');
  const identity = await context.hierarchy.confirmUserRecovery(
    userCredential.identityId,
    'native-phone',
    userCredential,
  );
  const workplaceCredential = await context.hierarchy.enrollWorkplace(
    identity,
    'native-workplace',
    'local-upgrade',
  );
  await context.hierarchy.confirmWorkplaceRecovery(
    identity,
    'native-workplace',
    workplaceCredential,
  );
  return { identity, userCredential, workplaceCredential };
}
it('creates and unwraps native keys without calling a JS vault or exposing private bytes', async () => {
  const s = await source();
  const user = await context.hierarchy.exportUserRecoveryPackage(
    s.identity.userId,
    s.identity.registeredDeviceId,
  );
  const workplace = await context.hierarchy.exportWorkplaceKeys(s.identity, 'native-workplace');
  for (const value of [
    s.userCredential,
    s.workplaceCredential,
    user,
    workplace,
    ...context.ciphertext.values(),
  ])
    noRawKeys(value);
  expect(s.userCredential.format).toBe('full-frills-recovery-handle');
  expect(workplace).not.toHaveProperty('writerDeviceId');
  expect(workplace).not.toHaveProperty('encryptionInvocations');
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
    context.hierarchy.confirmUserRecovery(s.identity.userId, s.identity.registeredDeviceId, {
      ...handle,
      handle: '00'.repeat(32),
    }),
  ).rejects.toThrow();
  await expect(
    context.hierarchy.confirmUserRecovery(s.identity.userId, s.identity.registeredDeviceId, handle),
  ).resolves.toEqual(s.identity);
});
it('native app-lock enforcement refuses key access even when a caller bypasses JS policy', async () => {
  const s = await source();
  const userRecord = parseLocalUser(
    await context.state.read(userScope(s.identity.userId, s.identity.registeredDeviceId)),
  );
  const userKey = await context.crypto.openKey({
    kind: 'user',
    user: userRecord,
  });
  const savedUser = await context.hierarchy.exportUserRecoveryPackage(
    s.identity.userId,
    s.identity.registeredDeviceId,
  );
  await host.execute('test.setAllowed', { allowed: false });
  await expect(
    context.crypto.hasKey({
      kind: 'device',
      userId: 'native-alice-😀',
      deviceId: 'native-phone',
    }),
  ).rejects.toMatchObject({ code: 'FFB_KEY_LOCKED' });
  await expect(context.crypto.openKey({ kind: 'user', user: userRecord })).rejects.toMatchObject({
    code: 'FFB_KEY_LOCKED',
  });
  await expect(
    context.crypto.wrapWorkplaceForUser(
      userKey,
      savedUser.publicIdentity,
      savedUser.userKeyFingerprint,
    ),
  ).rejects.toMatchObject({ code: 'FFB_KEY_LOCKED' });
  await expect(
    context.hierarchy.validateRecoveryCredential(savedUser, s.userCredential),
  ).rejects.toMatchObject({ code: 'FFB_KEY_LOCKED' });
  await host.execute('test.setAllowed', { allowed: true });
  await expect(
    context.crypto.hasKey({
      kind: 'device',
      userId: 'native-alice-😀',
      deviceId: 'native-phone',
    }),
  ).resolves.toBe(true);
});
it('rejects removed operations and generic raw-key export requests', async () => {
  for (const operation of [
    'encrypt',
    'decrypt',
    'sign',
    'exportPrivateKey',
    'openKeyEnvelope',
    'credentialFile',
    'getDEK',
  ])
    await expect(host.execute(operation, {})).rejects.toThrow();
});
it('matches the AES-256-GCM known-answer vector in the actual shared native core', async () => {
  await source();
  expect(
    await host.execute('test.aes', {
      key: '00'.repeat(32),
      nonce: '00'.repeat(12),
      plaintext: '00'.repeat(16),
    }),
  ).toBe('cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919');
});

it('invalidates unleased recovery handles natively across lock/unlock without JS cleanup', async () => {
  const credential = await context.hierarchy.beginUser('lock-test', 'device');
  await host.execute('test.setAllowed', { allowed: false });
  await host.execute('test.setAllowed', { allowed: true });
  await expect(host.execute('test.exportCredential', credential)).rejects.toMatchObject({
    code: 'FFB_KEY_REFERENCE_EXPIRED',
  });
});

it('round-trips a fixed buffer through native zstd with explicit sizes', async () => {
  await source();
  const result = (await host.execute('test.zstdSelfTest', {})) as {
    ok: boolean;
    version: string;
    sourceBytes: number;
    compressedBytes: number;
    decompressedBytes: number;
  };
  expect(result).toEqual({
    ok: true,
    version: '1.5.7',
    sourceBytes: 44,
    compressedBytes: expect.any(Number),
    decompressedBytes: 44,
  });
  expect(result.compressedBytes).toBeGreaterThan(0);
});
