import { closeNativeHost, enrolledKeyHierarchy, memoryKeyHierarchy } from './nativeTestContext';
import { parseNativeKeyReference } from '@/src/services/backup/nativeKeyApi';
import { parseEncryptedSnapshotEnvelope } from '@/src/services/backup/encryptedSnapshot';
import { parseLocalUser, userScope } from '@/src/services/backup/keyHierarchyRecords';
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
beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
});

afterEach(closeNativeHost);
async function references() {
  const { snapshot, workplaceId } = await seedSnapshotWorkplace();
  const s = await enrolledKeyHierarchy(workplaceId);
  const user = await s.crypto.openKey({
    kind: 'user',
    user: parseLocalUser(await s.state.read(userScope('alice', 'phone'))),
  });
  const keys = await s.hierarchy.exportWorkplaceKeys(s.identity, s.workplaceId);
  const workplace = await s.crypto.openKey({ kind: 'workplace', user, keys });
  return { ...s, user, keys, workplace, snapshot };
}
it('generates independent Device and User keys without exposing private bytes or caching unwrapped keys', async () => {
  const s = memoryKeyHierarchy();
  const device = parseNativeKeyReference(
    await s.crypto.generateKeys({ kind: 'device', userId: 'alice', deviceId: 'phone' }),
  );
  expect(await s.crypto.hasKey({ kind: 'device', userId: 'alice', deviceId: 'phone' })).toBe(true);
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
    s.crypto.generateKeys({ kind: 'device', userId: 'alice', deviceId: 'phone' }),
  ).rejects.toThrow();
});
it('opens key envelopes as references and decrypts only application data', async () => {
  const s = await references();
  expect(s.workplace.publicKey).toBeUndefined();
  expect(Object.keys(s.workplace).sort()).toEqual([
    'format',
    'formatVersion',
    'handle',
    'keyId',
    'kind',
  ]);
  const snapshot = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  expect(JSON.parse(String(await s.crypto.decrypt(s.workplace, snapshot)))).toEqual(s.snapshot);
  const reordered = Object.fromEntries(Object.entries(s.workplace).reverse());
  expect(JSON.parse(String(await s.host.execute('decrypt', { key: reordered, snapshot })))).toEqual(
    s.snapshot,
  );
  await expect(s.crypto.decrypt(s.user, snapshot)).rejects.toThrow();
  await expect(
    s.host.execute('decrypt', { key: s.workplace, snapshot: { ...snapshot, formatVersion: 2 } }),
  ).rejects.toThrow();
  await expect(
    s.host.execute('decrypt', { key: s.user, snapshot: s.keys.memberEnvelope }),
  ).rejects.toThrow();
  await expect(
    s.host.execute('decryptSnapshot', { user: {}, keys: {}, snapshot }),
  ).rejects.toThrow();
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
  ).rejects.toMatchObject({ code: 'FFB_KEY_INVALID_FILE', message: 'FFB_KEY_INVALID_FILE' });
  await expect(
    s.crypto.sign({ ...s.user, handle: '00'.repeat(32) }, 'sha256:' + '00'.repeat(32)),
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

it('streams snapshot headers while rejecting duplicate, mistyped and malformed header fields', async () => {
  const s = await references();
  const user = s.keys.userId;
  // Reserve an invocation as the normal coordinator does before exposing a writer reference.
  const key = await s.crypto.openKey({
    kind: 'workplace',
    user: s.user,
    keys: { ...s.keys, encryptionInvocations: 1 },
  });
  const id = JSON.stringify(s.keys.workplaceId);
  for (const source of [
    `{"schemaVersion":35,"workplace":{"id":${id},"id":${id}}}`,
    `{"schemaVersion":35,"schemaVersion":35,"workplace":{"id":${id}}}`,
    `{"schemaVersion":35,"workplace":{"id":${id}},"workplace":{"id":${id}}}`,
    `{"schemaVersion":"35","workplace":{"id":${id}}}`,
    `{"schemaVersion":35.0,"workplace":{"id":${id}}}`,
    `{"schemaVersion":35,"workplace":{"id":"other"}}`,
    `{"schemaVersion":35,"workplace":{"id":${id}},"data":[`,
    `{"schemaVersion":35,"workplace":{"id":${id}},"data":${'['.repeat(65)}0${']'.repeat(65)}}`,
  ]) {
    await expect(s.crypto.encrypt(key, source)).rejects.toMatchObject({
      code: 'FFB_KEY_INVALID_FILE',
    });
  }
  const plaintext = JSON.stringify({
    data: Array.from({ length: 20_000 }, () => ({ id: 'unrelated-nested-id', note: 'synthetic' })),
    workplace: { id: s.keys.workplaceId, name: user },
    schemaVersion: 35,
  });
  const encrypted = await s.crypto.encrypt(key, plaintext);
  expect(await s.crypto.decrypt(key, parseEncryptedSnapshotEnvelope(encrypted))).toBe(plaintext);
  await s.crypto.releaseKey(key);
});
it('rejects forged handles, metadata substitutions, wrong vaults and invalidated Device roots', async () => {
  const s = await references();
  const snapshot = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  for (const altered of [
    { ...s.workplace, handle: '00'.repeat(32) },
    { ...s.workplace, keyId: `sha256:${'00'.repeat(32)}` },
    { ...s.workplace, publicKey: '00'.repeat(32) },
  ])
    await expect(s.host.execute('decrypt', { key: altered, snapshot })).rejects.toThrow();
  const other = memoryKeyHierarchy();
  await expect(other.crypto.decrypt(s.workplace, snapshot)).rejects.toThrow();
  await s.crypto.removeKey({ kind: 'device', userId: 'alice', deviceId: 'phone' });
  await expect(s.crypto.decrypt(s.workplace, snapshot)).rejects.toThrow();
});
it('release and app-lock transitions invalidate references without retaining plaintext keys', async () => {
  const s = await references();
  const snapshot = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  await s.crypto.releaseKey(s.workplace);
  await s.crypto.releaseKey(s.workplace);
  await expect(s.crypto.decrypt(s.workplace, snapshot)).rejects.toThrow();
  const key = await s.crypto.openKey({ kind: 'workplace', user: s.user, keys: s.keys });
  await s.host.execute('test.setAllowed', { allowed: false });
  await expect(s.crypto.decrypt(key, snapshot)).rejects.toThrow();
  await s.crypto.releaseKey(key); // cleanup is allowed while locked
  await s.host.execute('test.setAllowed', { allowed: true });
  await expect(
    s.crypto.openKey({ kind: 'workplace', user: s.user, keys: s.keys }),
  ).rejects.toThrow();
});

it('wraps the existing User bundle for a new Device while preserving its encryption and signing identity', async () => {
  const s = await references();
  const target = memoryKeyHierarchy();
  const device = parseNativeKeyReference(
    await target.crypto.generateKeys({ kind: 'device', userId: 'alice', deviceId: 'tablet' }),
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
  const digest = `sha256:${'01'.repeat(32)}`;
  expect(await target.crypto.sign(user, digest)).toBe(await s.crypto.sign(s.user, digest));
  const key = await target.crypto.openKey({ kind: 'workplace', user, keys: s.keys });
  const snapshot = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  expect(JSON.parse(String(await target.crypto.decrypt(key, snapshot)))).toEqual(s.snapshot);
  await expect(
    s.crypto.wrapUserForDevice(s.user, { ...recipient, userId: 'bob' }),
  ).rejects.toThrow();
  await expect(
    s.crypto.wrapUserForDevice(s.user, { ...recipient, keyId: `sha256:${'00'.repeat(32)}` }),
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
  const snapshot = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  expect(JSON.parse(String(await target.crypto.decrypt(key, snapshot)))).toEqual(s.snapshot);
  const digest = `sha256:${'01'.repeat(32)}`;
  expect(await target.crypto.sign(user, digest)).not.toBe(await s.crypto.sign(s.user, digest));
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
