import { resetDatabase } from '@/src/testing/resetDatabase';
import { enableTestCrypto, seedSnapshotWorkplace } from './snapshotTestHelpers';
import { memoryKeyHierarchy } from './keyHierarchyTestHelpers';
import { EncryptionSetup } from '../encryptionSetup';
import { verifyLocalRecoveryPackage, type LocalRecoveryPackage } from '../localRecoveryPackage';
import {
  snapshotFingerprint,
  encryptWorkplaceSnapshot,
  keyFingerprint,
} from '../encryptedSnapshot';
import { publicKeyId, sealKeyEnvelope } from '../keyEnvelopes';
import type { EncryptionSetupStore, EncryptionSetupSession } from '../encryptionSetupStore';
import {
  recoverWorkplaceSnapshot,
  restoreWorkplaceSnapshot,
} from '@/src/services/import/restoreWorkplaceSnapshot';
import { captureWorkplaceSnapshot, SNAPSHOT_TABLES } from '../workplaceSnapshot';
import { asWorkplaceId } from '@/src/types/ids';
import { parseEncryptionSetupSession } from '../encryptionSetupValidation';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';

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

function storeFixture() {
  let session: EncryptionSetupSession | null = null;
  const packages = new Map<string, LocalRecoveryPackage>();
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const store: EncryptionSetupStore = {
    loadSession: jest.fn(async () => (session ? copy(session) : null)),
    saveSession: jest.fn(async value => {
      session = copy(value);
    }),
    writePackage: jest.fn(async value => {
      const id = packages.size.toString(16).padStart(32, '0');
      packages.set(id, copy(value));
      return {
        id,
        workplaceId: value.workplaceKeys.workplaceId,
        fingerprint: await snapshotFingerprint(JSON.stringify(value)),
        confirmed: false,
      };
    }),
    readPackage: jest.fn(async reference => copy(packages.get(reference.id)!)),
  };
  return { store, packages };
}
async function configured() {
  const { snapshot, workplaceId } = await seedSnapshotWorkplace();
  const context = memoryKeyHierarchy();
  const persistence = storeFixture();
  const publish = jest.fn(recoverWorkplaceSnapshot);
  const flow = new EncryptionSetup(
    context.hierarchy,
    persistence.store,
    () => undefined,
    async () => snapshot,
    publish,
  );
  const userSecret = await flow.beginUser();
  await flow.confirmUser(userSecret);
  const workplaceSecret = await flow.beginWorkplace(workplaceId);
  await flow.confirmWorkplace(workplaceId, workplaceSecret);
  return {
    ...context,
    ...persistence,
    flow,
    publish,
    snapshot,
    workplaceId,
    userSecret,
    workplaceSecret,
  };
}

it('requires saved-file verification and persists no credential/plaintext between steps', async () => {
  const { snapshot, workplaceId } = await seedSnapshotWorkplace();
  const context = memoryKeyHierarchy(),
    persistence = storeFixture();
  const flow = new EncryptionSetup(
    context.hierarchy,
    persistence.store,
    () => undefined,
    async () => snapshot,
    jest.fn(),
  );
  const secret = await flow.beginUser();
  expect((await flow.inspect(workplaceId)).keys?.user).toBe('pending');
  await expect(flow.preparePackage(workplaceId)).rejects.toThrow('User recovery');
  await expect(flow.confirmUser({ ...secret, phrase: 'wrong' })).rejects.toThrow();
  await flow.confirmUser(secret);
  const workplaceSecret = await flow.beginWorkplace(workplaceId);
  await expect(flow.preparePackage(workplaceId)).rejects.toThrow('Workplace recovery');
  await flow.confirmWorkplace(workplaceId, workplaceSecret);
  const pack = await flow.preparePackage(workplaceId);
  expect((await flow.inspect(workplaceId)).packageSaved).toBe(false);
  await flow.confirmPackage(pack);
  expect((await flow.inspect(workplaceId)).packageSaved).toBe(true);
  const persisted = JSON.stringify({
    session: await persistence.store.loadSession(),
    packages: [...persistence.packages.values()],
    ciphertext: [...context.ciphertext.values()],
  });
  expect(persisted).not.toContain(secret.phrase);
  expect(persisted).not.toContain(workplaceSecret.phrase);
  expect(persisted).not.toContain(snapshot.workplace.name);
  expect(pack).not.toHaveProperty('deviceEnvelope');
  expect(pack).not.toHaveProperty('credential');
});

it('resumes an interrupted export with identical signed ciphertext and no extra invocation', async () => {
  const context = await configured();
  const pack = await context.flow.preparePackage(context.workplaceId);
  const restarted = new EncryptionSetup(
    context.hierarchy,
    context.store,
    () => undefined,
    async () => context.snapshot,
    context.publish,
  );
  expect(await restarted.preparePackage(context.workplaceId)).toEqual(pack);
  expect(context.store.writePackage).toHaveBeenCalledTimes(1);
  expect(pack.workplaceKeys.encryptionInvocations).toBe(1);
  await restarted.confirmPackage(pack);
  const next = await restarted.preparePackage(context.workplaceId);
  expect(next.snapshot.snapshotId).not.toBe(pack.snapshot.snapshotId);
  expect(next.workplaceKeys.keyId).toBe(pack.workplaceKeys.keyId);
  expect(next.workplaceKeys.encryptionInvocations).toBe(2);
  await expect(restarted.confirmPackage(pack)).rejects.toThrow('just saved');
});

it('authenticates a whole replacement envelope/snapshot before any recovery writes', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  const fakeKey = new Uint8Array(32).fill(7);
  const fakeId = await keyFingerprint(fakeKey);
  const forged = {
    ...pack,
    workplaceKeys: {
      ...pack.workplaceKeys,
      keyId: fakeId,
      memberEnvelope: await sealKeyEnvelope(
        fakeKey,
        pack.userRecoveryPackage.publicIdentity.encryptionPublicKey,
        {
          purpose: 'user-workplace-dek',
          userId: pack.workplaceKeys.userId,
          workplaceId: source.workplaceId,
          keyId: fakeId,
          recipientKeyId: await publicKeyId(
            pack.userRecoveryPackage.publicIdentity.encryptionPublicKey,
          ),
        },
      ),
    },
    snapshot: await encryptWorkplaceSnapshot(source.snapshot, fakeKey),
  };
  fakeKey.fill(0);
  const target = memoryKeyHierarchy(),
    persistence = storeFixture(),
    publish = jest.fn();
  const flow = new EncryptionSetup(
    target.hierarchy,
    persistence.store,
    () => undefined,
    jest.fn(),
    publish,
  );
  await expect(flow.recover(forged, source.userSecret)).rejects.toThrow('signature');
  expect(await persistence.store.loadSession()).toBeNull();
  expect(target.deviceSecrets.size).toBe(0);
  expect(target.ciphertext.size).toBe(0);
  expect(publish).not.toHaveBeenCalled();
  await expect(flow.recover(pack, source.workplaceSecret)).rejects.toThrow('User recovery');
});

it('recovers the same User/DEK/records onto a fresh Device and makes publication retries idempotent', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  await source.flow.confirmPackage(pack);
  await resetDatabase();
  const target = memoryKeyHierarchy(),
    persistence = storeFixture();
  const flow = new EncryptionSetup(
    target.hierarchy,
    persistence.store,
    () => undefined,
    jest.fn(),
    recoverWorkplaceSnapshot,
  );
  const result = await flow.recover(pack, source.userSecret);
  const session = await persistence.store.loadSession();
  expect(session?.userId).toBe(source.userSecret.identityId);
  expect(session?.userKeyFingerprint).toBe(source.userSecret.identityKeyId);
  expect(session?.deviceId).not.toBe((await source.store.loadSession())?.deviceId);
  expect(result.workplaceId).toBe(source.workplaceId);
  const restored = await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId));
  for (const { key } of SNAPSHOT_TABLES) {
    const expected = [...(source.snapshot.data[key] ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const ids = new Set(expected.map(row => row.id));
    const actual = (restored.data[key] ?? [])
      .filter(row => ids.has(row.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(actual).toEqual(expected);
  }
  const auditCount = (restored.data.auditLogs ?? []).length;
  const firstKey = [...target.deviceSecrets.values()][0];
  await flow.recover(pack, source.userSecret);
  expect(
    (await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId))).data.auditLogs,
  ).toHaveLength(auditCount);
  expect(target.deviceSecrets.size).toBe(1);
  expect([...target.deviceSecrets.values()][0]).toEqual(firstKey);
  const status = await flow.inspect(source.workplaceId);
  expect(status.packageSaved).toBe(true);
  expect(status.keys?.writerAllowed).toBe(false);
  await expect(flow.preparePackage(source.workplaceId)).rejects.toThrow('handover');
});

it('never resets an established User or an established Workplace during discard', async () => {
  const source = await configured();
  await expect(source.flow.discardUnfinished(source.workplaceId)).rejects.toThrow('established');
  const pending = 'pending-books';
  const secret = await source.flow.beginWorkplace(pending);
  await source.flow.discardUnfinished(pending);
  expect((await source.flow.inspect(pending)).keys?.workplace).toBe('missing');
  const replacement = await source.flow.beginWorkplace(pending);
  expect(replacement.identityKeyId).not.toBe(secret.identityKeyId);
  expect(replacement.identityId).toBe(pending);
  expect((await source.store.loadSession())?.userKeyFingerprint).toBe(
    source.userSecret.identityKeyId,
  );
});

it('stops cancelled recovery before mutation and rejects secret fields in durable progress', async () => {
  const source = await configured(),
    pack = await source.flow.preparePackage(source.workplaceId);
  const target = memoryKeyHierarchy(),
    persistence = storeFixture(),
    publish = jest.fn();
  const flow = new EncryptionSetup(
    target.hierarchy,
    persistence.store,
    () => undefined,
    jest.fn(),
    publish,
  );
  await expect(
    flow.recover(pack, source.userSecret, () => {
      throw new Error('cancelled');
    }),
  ).rejects.toThrow('cancelled');
  expect(await persistence.store.loadSession()).toBeNull();
  expect(publish).not.toHaveBeenCalled();
  const session = await source.store.loadSession();
  expect(() =>
    parseEncryptionSetupSession({ ...session, phrase: source.userSecret.phrase }),
  ).toThrow();
  await expect(
    verifyLocalRecoveryPackage(
      { ...pack, signature: '00'.repeat(64) },
      { userId: source.userSecret.identityId, userKeyFingerprint: source.userSecret.identityKeyId },
    ),
  ).rejects.toThrow('signature');
});

it('rejects a wrong phrase before creating progress or Device keys', async () => {
  const source = await configured(),
    pack = await source.flow.preparePackage(source.workplaceId);
  const target = memoryKeyHierarchy(),
    persistence = storeFixture(),
    publish = jest.fn();
  const flow = new EncryptionSetup(
    target.hierarchy,
    persistence.store,
    () => undefined,
    jest.fn(),
    publish,
  );
  await expect(
    flow.recover(pack, { ...source.userSecret, phrase: '00'.repeat(38) }),
  ).rejects.toThrow();
  expect(await persistence.store.loadSession()).toBeNull();
  expect(target.deviceSecrets.size).toBe(0);
  expect(publish).not.toHaveBeenCalled();
});

it('never creates a new User root when an interrupted recovery has a known identity', async () => {
  const context = memoryKeyHierarchy(),
    persistence = storeFixture();
  await persistence.store.saveSession({
    formatVersion: 1,
    intent: 'recover-user',
    userId: 'known',
    deviceId: 'fresh',
    userKeyFingerprint: `sha256:${'01'.repeat(32)}`,
  });
  const flow = new EncryptionSetup(
    context.hierarchy,
    persistence.store,
    () => undefined,
    jest.fn(),
    jest.fn(),
  );
  expect((await flow.inspect()).keys?.user).toBe('recovery-required');
  await expect(flow.beginUser()).rejects.toThrow('new root');
  await expect(flow.discardUnfinished()).rejects.toThrow('Known User');
  expect(context.deviceSecrets.size).toBe(0);
  expect(context.ciphertext.size).toBe(0);
});

it('recovers a lost Workplace record read-only instead of regenerating its DEK or reusing an old counter', async () => {
  const source = await configured(),
    pack = await source.flow.preparePackage(source.workplaceId);
  await source.hierarchy.withWorkplaceKey(
    {
      userId: source.userSecret.identityId,
      registeredDeviceId: (await source.store.loadSession())!.deviceId,
      userKeyFingerprint: source.userSecret.identityKeyId,
    },
    source.workplaceId,
    async () => undefined,
    true,
  );
  source.ciphertext.delete(
    JSON.stringify(['workplace', source.userSecret.identityId, source.workplaceId]),
  );
  expect((await source.flow.inspect(source.workplaceId)).keys?.workplace).toBe('recovery-required');
  await expect(source.flow.beginWorkplace(source.workplaceId)).rejects.toThrow('already exists');
  await resetDatabase();
  await source.flow.recover(pack, source.userSecret);
  const status = await source.flow.inspect(source.workplaceId);
  expect(status.keys?.budgetExhausted).toBe(true);
  expect(status.keys?.writerAllowed).toBe(false);
  expect((await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId))).workplace.id).toBe(
    source.workplaceId,
  );
  await expect(source.flow.preparePackage(source.workplaceId)).rejects.toThrow('budget');
});

it('removes only Device access after verified exports while retaining an independently readable encrypted package', async () => {
  const source = await configured(),
    pack = await source.flow.preparePackage(source.workplaceId);
  await expect(source.flow.forgetDevice()).rejects.toThrow('Verify');
  await source.flow.confirmPackage(pack);
  await source.flow.forgetDevice();
  expect(source.deviceSecrets.size).toBe(0);
  expect((await source.flow.inspect(source.workplaceId)).keys?.user).toBe('recovery-required');
  await expect(source.flow.beginUser()).rejects.toThrow('new root');
  expect(await source.flow.savedPackage()).toEqual(pack); // No lost Device/User key needed to locate ciphertext.
});

it('recovers removed Device access without republishing or replacing retained local books', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  await source.flow.confirmPackage(pack);
  const workplace = await workplaceRepository.find(asWorkplaceId(source.workplaceId));
  await workplaceRepository.update(workplace!, { name: 'Books edited since backup' });
  const before = await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId));
  await source.flow.forgetDevice();
  const result = await source.flow.recover(pack, source.userSecret);
  expect(result).toMatchObject({ kind: 'keys-recovered', workplaceId: source.workplaceId });
  const after = await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId));
  expect(after.workplace).toEqual(before.workplace);
  expect(after.data).toEqual(before.data);
  expect((await source.flow.inspect(source.workplaceId)).keys?.user).toBe('ready');
  expect((await source.flow.savedPackage()).workplaceKeys.keyId).toBe(pack.workplaceKeys.keyId);
});

it('does not treat a freshly imported key package as permission to claim colliding local books', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  const target = memoryKeyHierarchy();
  const targetStore = storeFixture();
  const flow = new EncryptionSetup(
    target.hierarchy,
    targetStore.store,
    () => undefined,
    jest.fn(),
    recoverWorkplaceSnapshot,
  );
  const before = await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId));
  await expect(flow.recover(pack, source.userSecret)).rejects.toThrow(
    'Snapshot Workplace already exists',
  );
  const workplaceScope = JSON.stringify([
    'workplace',
    source.userSecret.identityId,
    source.workplaceId,
  ]);
  expect(target.ciphertext.has(workplaceScope)).toBe(false);
  await expect(flow.recover(pack, source.userSecret)).rejects.toThrow(
    'Snapshot Workplace already exists',
  );
  expect(target.ciphertext.has(workplaceScope)).toBe(false);
  expect((await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId))).data).toEqual(
    before.data,
  );
});

it('never promotes keys from a rejected publication into a trusted binding, including restart and Device-key loss', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  await resetDatabase();
  const target = memoryKeyHierarchy(),
    persistence = storeFixture();
  const publish = jest.fn(async (...args: Parameters<typeof recoverWorkplaceSnapshot>) => {
    if (!(await workplaceRepository.find(asWorkplaceId(source.workplaceId)))) {
      await restoreWorkplaceSnapshot({
        ...source.snapshot,
        workplace: {
          ...source.snapshot.workplace,
          name: 'Unrelated books created after preflight',
        },
      });
    }
    return recoverWorkplaceSnapshot(...args);
  });
  const restart = () =>
    new EncryptionSetup(target.hierarchy, persistence.store, () => undefined, jest.fn(), publish);
  await expect(restart().recover(pack, source.userSecret)).rejects.toThrow(
    'Snapshot Workplace already exists',
  );
  expect((await persistence.store.loadSession())?.pendingRecoveries).toEqual([
    {
      workplaceId: source.workplaceId,
      keyId: pack.workplaceKeys.keyId,
      preserveExistingBooks: false,
    },
  ]);
  expect((await restart().inspect(source.workplaceId)).packageSaved).toBe(false);
  await expect(restart().recover(pack, source.userSecret)).rejects.toThrow(
    'Snapshot Workplace already exists',
  );
  target.deviceSecrets.clear();
  await expect(restart().recover(pack, source.userSecret)).rejects.toThrow(
    'Snapshot Workplace already exists',
  );
  // Losing the entire setup checkpoint must not promote surviving imported keys either.
  jest.mocked(persistence.store.loadSession).mockResolvedValueOnce(null);
  await expect(restart().recover(pack, source.userSecret)).rejects.toThrow(
    'Snapshot Workplace already exists',
  );
  expect(publish.mock.calls.every(([, options]) => options.preserveExistingBooks === false)).toBe(
    true,
  );
  expect((await workplaceRepository.find(asWorkplaceId(source.workplaceId)))?.name).toBe(
    'Unrelated books created after preflight',
  );
  expect(persistence.store.writePackage).not.toHaveBeenCalled();
});

it('completes an exact publication retry after a crash before recovery progress was confirmed', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  await resetDatabase();
  const target = memoryKeyHierarchy(),
    persistence = storeFixture();
  const flow = new EncryptionSetup(
    target.hierarchy,
    persistence.store,
    () => undefined,
    jest.fn(),
    recoverWorkplaceSnapshot,
  );
  jest
    .mocked(persistence.store.writePackage)
    .mockRejectedValueOnce(new Error('checkpoint interrupted'));
  await expect(flow.recover(pack, source.userSecret)).rejects.toThrow('checkpoint interrupted');
  const original = await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId));
  await flow.recover(pack, source.userSecret);
  expect((await captureWorkplaceSnapshot(asWorkplaceId(source.workplaceId))).data).toEqual(
    original.data,
  );
  expect((await persistence.store.loadSession())?.pendingRecoveries).toBeUndefined();
  expect((await flow.inspect(source.workplaceId)).packageSaved).toBe(true);
  const session = await persistence.store.loadSession();
  expect(() =>
    parseEncryptionSetupSession({
      ...session,
      pendingRecoveries: [
        {
          workplaceId: source.workplaceId,
          keyId: pack.workplaceKeys.keyId,
          preserveExistingBooks: false,
          phrase: source.userSecret.phrase,
        },
      ],
    }),
  ).toThrow('progress');
});

it('keeps pending ciphertext and spent usage when abandonment cannot persist its checkpoint', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  const previous = await source.store.loadSession();
  jest.mocked(source.store.saveSession).mockRejectedValueOnce(new Error('storage denied'));
  await expect(source.flow.abandonPendingPackage(source.workplaceId)).rejects.toThrow(
    'storage denied',
  );
  expect(await source.store.loadSession()).toEqual(previous);
  expect(await source.flow.preparePackage(source.workplaceId)).toEqual(pack);
  expect(source.store.writePackage).toHaveBeenCalledTimes(1);
});

it('explicitly abandons an unavailable unfinished package without replacing keys or reclaiming usage', async () => {
  const source = await configured();
  const pack = await source.flow.preparePackage(source.workplaceId);
  jest
    .mocked(source.store.readPackage)
    .mockRejectedValueOnce(new Error('Encrypted recovery package is unavailable'));
  await expect(source.flow.preparePackage(source.workplaceId)).rejects.toThrow('unavailable');
  // The checkpoint has to be abandonable even though its referenced file cannot be read.
  await source.flow.abandonPendingPackage(source.workplaceId);
  const next = await source.flow.preparePackage(source.workplaceId);
  expect(next.snapshot.snapshotId).not.toBe(pack.snapshot.snapshotId);
  expect(next.workplaceKeys.keyId).toBe(pack.workplaceKeys.keyId);
  expect(next.userRecoveryPackage).toEqual(pack.userRecoveryPackage);
  expect(next.workplaceKeys.encryptionInvocations).toBe(2);
  await source.flow.confirmPackage(next);
  await expect(source.flow.abandonPendingPackage(source.workplaceId)).rejects.toThrow('unfinished');
});
