import { webcrypto } from 'node:crypto';
import { closeNativeHost, enrolledKeyHierarchy, memoryKeyHierarchy } from './nativeTestContext';
import { parseNativeKeyReference } from '@/src/services/backup/nativeKeyApi';
import { parseLocalUser, userScope } from '@/src/services/backup/keyHierarchyRecords';
import { resetDatabase } from '@/src/testing/resetDatabase';
jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
beforeEach(async () => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  await resetDatabase();
});
afterEach(closeNativeHost);
async function references() {
  const s = await enrolledKeyHierarchy();
  const user = await s.crypto.openKey({
    kind: 'user',
    user: parseLocalUser(await s.state.read(userScope('alice', 'phone'))),
  });
  const keys = await s.hierarchy.exportWorkplaceKeys(s.identity, s.workplaceId);
  const workplace = await s.crypto.openKey({ kind: 'workplace', user, keys });
  return { ...s, user, keys, workplace };
}
it('generates independent Device and User keys without exposing private bytes or caching unwrapped keys', async () => {
  const s = memoryKeyHierarchy();
  const device = parseNativeKeyReference(
    await s.crypto.generateKeys({
      kind: 'device',
      userId: 'alice',
      deviceId: 'phone',
    }),
  );
  expect(
    await s.crypto.hasKey({
      kind: 'device',
      userId: 'alice',
      deviceId: 'phone',
    }),
  ).toBe(true);
  expect(Object.keys(device).sort()).toEqual([
    'format',
    'formatVersion',
    'handle',
    'keyId',
    'kind',
    'publicKey',
  ]);
  const generated = (await s.crypto.generateKeys({ kind: 'user', device })) as {
    key: unknown;
    user: { devicePublicKey: string };
  };
  const user = parseNativeKeyReference(generated.key);
  expect(user.publicKey).not.toBe(device.publicKey);
  expect(generated.user.devicePublicKey).toBe(device.publicKey);
  expect(s.deviceTags.size).toBe(1);
  await expect(s.crypto.generateKeys({ kind: 'user', device })).rejects.toThrow();
  await expect(
    s.crypto.generateKeys({
      kind: 'device',
      userId: 'alice',
      deviceId: 'phone',
    }),
  ).rejects.toThrow();
});
it('opens key envelopes as opaque references and rejects raw-key export requests', async () => {
  const s = await references();
  expect(s.workplace.publicKey).toBeUndefined();
  expect(Object.keys(s.workplace).sort()).toEqual([
    'format',
    'formatVersion',
    'handle',
    'keyId',
    'kind',
  ]);
  await expect(
    s.host.execute('openKey', {
      kind: 'workplace',
      user: s.user,
      keys: s.keys,
      exportPrivateKey: true,
    }),
  ).rejects.toThrow();
});
it('reports safe native error codes for locked, invalid, expired and missing-key states', async () => {
  const s = await references();
  await expect(
    s.host.execute('validateRecovery', {
      user: 'sensitive-fixture-content',
      credential: null,
    }),
  ).rejects.toMatchObject({
    code: 'FFB_KEY_INVALID_FILE',
    message: 'FFB_KEY_INVALID_FILE',
  });
  const saved = await s.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  await expect(
    s.crypto.wrapWorkplaceForUser(
      { ...s.workplace, handle: '00'.repeat(32) },
      saved.publicIdentity,
      saved.userKeyFingerprint,
    ),
  ).rejects.toMatchObject({ code: 'FFB_KEY_REFERENCE_EXPIRED' });
  await s.host.execute('test.setAllowed', { allowed: false });
  await expect(
    s.crypto.hasKey({ kind: 'device', userId: 'alice', deviceId: 'phone' }),
  ).rejects.toMatchObject({ code: 'FFB_KEY_LOCKED' });
  await s.host.execute('test.setAllowed', { allowed: true });
  await s.eraseDeviceKeys();
  await expect(
    s.crypto.openKey({
      kind: 'user',
      user: parseLocalUser(await s.state.read(userScope('alice', 'phone'))),
    }),
  ).rejects.toMatchObject({ code: 'FFB_KEY_RECOVERY_REQUIRED' });
});
it('rejects forged handles, metadata substitutions, wrong vaults and invalidated Device roots', async () => {
  const s = await references();
  const saved = await s.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  await expect(
    s.crypto.wrapWorkplaceForUser(
      { ...s.workplace, handle: '00'.repeat(32) },
      saved.publicIdentity,
      saved.userKeyFingerprint,
    ),
  ).rejects.toThrow();
  for (const patch of [
    { keyId: `sha256:${'00'.repeat(32)}` },
    { kind: 'user' as const },
    { publicKey: '00'.repeat(32) },
  ])
    await expect(
      s.crypto.wrapWorkplaceForUser(
        { ...s.workplace, ...patch },
        saved.publicIdentity,
        saved.userKeyFingerprint,
      ),
    ).rejects.toThrow();
  const other = memoryKeyHierarchy();
  await expect(
    other.crypto.wrapWorkplaceForUser(s.workplace, saved.publicIdentity, saved.userKeyFingerprint),
  ).rejects.toThrow();
  await s.crypto.removeKey({
    kind: 'device',
    userId: 'alice',
    deviceId: 'phone',
  });
  await expect(
    s.crypto.wrapWorkplaceForUser(s.workplace, saved.publicIdentity, saved.userKeyFingerprint),
  ).rejects.toThrow();
});
it('release and app-lock transitions invalidate references without retaining plaintext keys', async () => {
  const s = await references();
  const saved = await s.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  await s.crypto.releaseKey(s.workplace);
  await s.crypto.releaseKey(s.workplace);
  await expect(
    s.crypto.wrapWorkplaceForUser(s.workplace, saved.publicIdentity, saved.userKeyFingerprint),
  ).rejects.toMatchObject({ code: 'FFB_KEY_REFERENCE_EXPIRED' });
  const key = await s.crypto.openKey({ kind: 'workplace', user: s.user, keys: s.keys });
  await s.host.execute('test.setAllowed', { allowed: false });
  await expect(
    s.crypto.wrapWorkplaceForUser(key, saved.publicIdentity, saved.userKeyFingerprint),
  ).rejects.toMatchObject({ code: 'FFB_KEY_LOCKED' });
  await s.crypto.releaseKey(s.workplace); // cleanup remains idempotent while locked
  await s.host.execute('test.setAllowed', { allowed: true });
  await expect(
    s.crypto.wrapWorkplaceForUser(key, saved.publicIdentity, saved.userKeyFingerprint),
  ).rejects.toMatchObject({ code: 'FFB_KEY_REFERENCE_EXPIRED' });
  await s.crypto.releaseKey(key);
});
it('wraps the existing User bundle for a new Device while preserving its identity', async () => {
  const s = await references();
  const target = memoryKeyHierarchy();
  const device = parseNativeKeyReference(
    await target.crypto.generateKeys({
      kind: 'device',
      userId: 'alice',
      deviceId: 'tablet',
    }),
  );
  const recipient = {
    userId: 'alice',
    deviceId: 'tablet',
    publicKey: device.publicKey!,
    keyId: device.keyId,
  };
  const wrapped = await s.crypto.wrapUserForDevice(s.user, recipient);
  const original = parseLocalUser(await s.state.read(userScope('alice', 'phone')));
  const local = { ...original, ...wrapped };
  const user = await target.crypto.openKey({ kind: 'user', user: local });
  expect(user.keyId).toBe(s.user.keyId);
  expect(user.publicKey).toBe(s.user.publicKey);
  const key = await target.crypto.openKey({
    kind: 'workplace',
    user,
    keys: s.keys,
  });
  expect(key.keyId).toBe(s.workplace.keyId);
  await expect(
    s.crypto.wrapUserForDevice(s.user, { ...recipient, userId: 'bob' }),
  ).rejects.toThrow();
  await expect(
    s.crypto.wrapUserForDevice(s.user, {
      ...recipient,
      keyId: `sha256:${'00'.repeat(32)}`,
    }),
  ).rejects.toThrow();
  await expect(s.crypto.wrapUserForDevice(s.workplace, recipient)).rejects.toThrow();
});
it('wraps the same DEK for another User without creating membership or changing its fingerprint', async () => {
  const s = await references();
  const target = memoryKeyHierarchy();
  const credential = await target.hierarchy.beginUser('bob', 'bob-phone');
  await target.hierarchy.confirmUserRecovery('bob', 'bob-phone', credential);
  const local = parseLocalUser(await target.state.read(userScope('bob', 'bob-phone')));
  const wrapped = await s.crypto.wrapWorkplaceForUser(
    s.workplace,
    local.publicIdentity,
    local.userKeyFingerprint,
  );
  expect(wrapped.keyId).toBe(s.keys.keyId);
  expect(wrapped.workplaceId).toBe(s.workplaceId);
  expect(wrapped.memberEnvelope.context.userId).toBe('bob');
  const user = await target.crypto.openKey({ kind: 'user', user: local });
  const key = await target.crypto.openKey({
    kind: 'workplace',
    user,
    keys: { ...s.keys, ...wrapped },
  });
  expect(key.keyId).toBe(s.workplace.keyId);
  await expect(
    s.crypto.wrapWorkplaceForUser(s.workplace, local.publicIdentity, `sha256:${'00'.repeat(32)}`),
  ).rejects.toThrow();
  await expect(
    s.crypto.wrapWorkplaceForUser(s.user, local.publicIdentity, local.userKeyFingerprint),
  ).rejects.toThrow();
  await expect(
    target.crypto.openKey({
      kind: 'workplace',
      user,
      keys: { ...s.keys, ...wrapped, workplaceId: 'wrong' },
    }),
  ).rejects.toThrow();
});
it('rejects uppercase public-key encodings in the native identity boundary', async () => {
  const s = await references();
  const saved = await s.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  const identity = {
    ...saved.publicIdentity,
    encryptionPublicKey: saved.publicIdentity.encryptionPublicKey.toUpperCase(),
  };
  await expect(
    s.host.execute('wrapWorkplaceForUser', {
      key: s.workplace,
      recipient: identity,
      userKeyFingerprint: saved.userKeyFingerprint,
    }),
  ).rejects.toMatchObject({ code: 'FFB_KEY_INVALID_FILE' });
});
