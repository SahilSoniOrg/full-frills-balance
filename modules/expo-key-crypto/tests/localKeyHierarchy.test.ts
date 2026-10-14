import { closeNativeHost, enrolledKeyHierarchy, memoryKeyHierarchy } from './nativeTestContext';
import { resetDatabase } from '@/src/testing/resetDatabase';
import {
  enableTestCrypto,
  seedSnapshotWorkplace,
} from '@/src/services/backup/__tests__/snapshotTestHelpers';
import { LocalKeyHierarchy, type LocalUserKeys } from '@/src/services/backup/localKeyHierarchy';
import {
  encryptWorkplaceSnapshot,
  sealKeyEnvelope,
  generateUserSigningPair,
} from './envelopeTestTools';
import { keyFingerprint } from '@/src/services/backup/encryptedSnapshot';
import { publicKeyId } from '@/src/services/backup/keyEnvelopes';
import { keyHex } from '@/src/services/backup/keyEncoding';
import { userIdentityFingerprint } from '@/src/services/backup/userIdentity';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissingKeyStateError } from '@/src/services/backup/keyStateErrors';
import type { RecoveryArtifactSource } from '@/src/services/backup/recoveryArtifactSource';
import { createWorkplaceDump, decryptWorkplaceDump } from '@/src/services/backup/workplaceDump';
import { assertKeyAccessAllowed, setKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
afterEach(closeNativeHost);
beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
});

it('opens Device → User → Workplace after restart and exposes only public/encrypted state to JS', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const context = await enrolledKeyHierarchy();
  const encrypted = await context.hierarchy.encryptSnapshot(
    context.identity,
    context.workplaceId,
    snapshot,
  );
  const persisted = JSON.stringify([...context.ciphertext.values()]);
  for (const field of ['privateKey', 'signingPrivateKey', 'phrase', 'handle'])
    expect(persisted).not.toContain(`"${field}"`);
  const user = [...context.ciphertext.values()].find(
    value => (value as LocalUserKeys).deviceEnvelope,
  ) as LocalUserKeys;
  expect(user.publicIdentity.signingAlgorithm).toBe('Ed25519');
  expect(context.deviceTags.size).toBe(1);
  expect(context.hierarchy).not.toHaveProperty('withWorkplaceKey');
  const restarted = new LocalKeyHierarchy(context.state, () => undefined, context.crypto);
  expect(await restarted.decryptSnapshot(context.identity, context.workplaceId, encrypted)).toEqual(
    snapshot,
  );
});
it('requires separate external save/readback confirmations and never invents missing Workplace keys', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const context = memoryKeyHierarchy();
  const credential = await context.hierarchy.beginUser('alice', 'phone');
  const forgedIdentity = {
    userId: 'alice',
    registeredDeviceId: 'phone',
    userKeyFingerprint: credential.identityKeyId,
  };
  await expect(
    context.hierarchy.enrollWorkplace(forgedIdentity, 'books', 'creation'),
  ).rejects.toThrow('confirmation');
  await expect(
    context.hierarchy.confirmUserRecovery('alice', 'phone', {
      ...credential,
      handle: '00'.repeat(32),
    }),
  ).rejects.toThrow();
  const identity = await context.hierarchy.confirmUserRecovery('alice', 'phone', credential);
  await expect(context.hierarchy.encryptSnapshot(identity, 'books', snapshot)).rejects.toThrow(
    'Enroll',
  );
  const dumpCredential = await context.hierarchy.enrollWorkplace(identity, 'books', 'creation');
  await expect(context.hierarchy.encryptSnapshot(identity, 'books', snapshot)).rejects.toThrow(
    'Confirm',
  );
  await context.hierarchy.confirmWorkplaceRecovery(identity, 'books', dumpCredential);
  const original = await context.hierarchy.exportWorkplaceKeys(identity, 'books');
  await expect(context.hierarchy.enrollWorkplace(identity, 'books', 'creation')).rejects.toThrow(
    'already exists',
  );
  expect((await context.hierarchy.exportWorkplaceKeys(identity, 'books')).keyId).toBe(
    original.keyId,
  );
});
it('recovers the SAME User into independent Device keys and opens its existing member envelope', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const source = await enrolledKeyHierarchy();
  const encrypted = await source.hierarchy.encryptSnapshot(
    source.identity,
    source.workplaceId,
    snapshot,
  );
  const recoveryPackage = await source.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  expect(recoveryPackage).not.toHaveProperty('deviceEnvelope');
  const replacement = memoryKeyHierarchy();
  const identity = await replacement.hierarchy.recoverUserDevice(
    source.userCredential,
    recoveryPackage,
    'replacement',
  );
  expect(identity.userId).toBe(source.identity.userId);
  expect(identity.userKeyFingerprint).toBe(source.identity.userKeyFingerprint);
  await replacement.hierarchy.installWorkplaceKeys(
    identity,
    await source.hierarchy.exportWorkplaceKeys(source.identity, source.workplaceId),
  );
  expect(
    await replacement.hierarchy.decryptSnapshot(identity, source.workplaceId, encrypted),
  ).toEqual(snapshot);
  expect([...replacement.deviceTags.values()][0]).not.toEqual([...source.deviceTags.values()][0]);
  await expect(
    replacement.hierarchy.encryptSnapshot(identity, source.workplaceId, snapshot),
  ).rejects.toThrow('handover');
});
it('rejects cross-User/Device/Workplace substitution, wrong credentials, and altered envelopes', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const source = await enrolledKeyHierarchy();
  await expect(
    source.hierarchy.encryptSnapshot(
      { ...source.identity, userId: 'bob' },
      source.workplaceId,
      snapshot,
    ),
  ).rejects.toThrow();
  await expect(
    source.hierarchy.encryptSnapshot(
      { ...source.identity, registeredDeviceId: 'wrong' },
      source.workplaceId,
      snapshot,
    ),
  ).rejects.toThrow();
  const saved = await source.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  const replacement = memoryKeyHierarchy();
  await expect(
    replacement.hierarchy.recoverUserDevice(
      { ...source.userCredential, identityId: 'bob' },
      saved,
      'new',
    ),
  ).rejects.toThrow();
  await expect(
    replacement.hierarchy.recoverUserDevice(
      source.userCredential,
      {
        ...saved,
        recoveryEnvelope: { ...saved.recoveryEnvelope, encapsulatedKey: '00'.repeat(32) },
      },
      'new',
    ),
  ).rejects.toThrow();
  expect(replacement.deviceTags.size).toBe(0);
  expect(replacement.ciphertext.size).toBe(0);
  const scope = JSON.stringify(['workplace', 'alice', source.workplaceId]);
  const keys = await source.hierarchy.exportWorkplaceKeys(source.identity, source.workplaceId);
  source.ciphertext.set(scope, {
    ...keys,
    memberEnvelope: {
      ...keys.memberEnvelope,
      context: { ...keys.memberEnvelope.context, workplaceId: 'other' },
    },
  });
  await expect(
    source.hierarchy.encryptSnapshot(source.identity, source.workplaceId, snapshot),
  ).rejects.toThrow();
});
it('Workplace dump recovery returns only readable data and works without User or Device secrets', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const context = await enrolledKeyHierarchy();
  const encrypted = await context.hierarchy.encryptSnapshot(
    context.identity,
    context.workplaceId,
    snapshot,
  );
  const dump = createWorkplaceDump(
    await context.hierarchy.exportWorkplaceKeys(context.identity, context.workplaceId),
    encrypted,
  );
  expect(dump).not.toHaveProperty('memberEnvelope');
  expect(dump).not.toHaveProperty('userPrivateKey');
  context.ciphertext.clear();
  await context.eraseDeviceKeys();
  expect(await decryptWorkplaceDump(dump, context.workplaceCredential)).toEqual(snapshot);
  await expect(decryptWorkplaceDump(dump, context.userCredential)).rejects.toThrow();
  await expect(
    decryptWorkplaceDump({ ...dump, workplaceId: 'other' }, context.workplaceCredential),
  ).rejects.toThrow();
});
it('burns durable encryption reservations before use, retains failures, and blocks exhausted budgets', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const context = await enrolledKeyHierarchy();
  const scope = JSON.stringify(['workplace', 'alice', context.workplaceId]);
  await expect(
    context.hierarchy.encryptSnapshot(context.identity, context.workplaceId, {
      ...snapshot,
      workplace: { ...snapshot.workplace, id: 'other' },
    }),
  ).rejects.toThrow();
  const keys = await context.hierarchy.exportWorkplaceKeys(context.identity, context.workplaceId);
  expect(keys.encryptionInvocations).toBe(1);
  const encrypted = await context.hierarchy.encryptSnapshot(
    context.identity,
    context.workplaceId,
    snapshot,
  );
  context.ciphertext.set(scope, { ...keys, encryptionInvocations: 2 ** 20 });
  const calls = jest.mocked(context.crypto.openKey).mock.calls.length;
  await expect(
    context.hierarchy.encryptSnapshot(context.identity, context.workplaceId, snapshot),
  ).rejects.toThrow('budget');
  expect(jest.mocked(context.crypto.openKey).mock.calls.length).toBe(calls);
  expect(
    await context.hierarchy.decryptSnapshot(context.identity, context.workplaceId, encrypted),
  ).toEqual(snapshot);
});
it('checks app lock after awaited native operations and fails closed without a shell', async () => {
  setKeyAccessAllowed(false);
  expect(assertKeyAccessAllowed).toThrow('Unlock');
  const { snapshot } = await seedSnapshotWorkplace();
  const context = await enrolledKeyHierarchy();
  let unlocked = true;
  const hierarchy = new LocalKeyHierarchy(
    context.state,
    () => {
      if (!unlocked) throw new Error('locked');
    },
    context.crypto,
  );
  const invoke = jest.mocked(context.crypto.openKey).getMockImplementation()!;
  jest.mocked(context.crypto.openKey).mockImplementationOnce(async request => {
    const result = await invoke(request);
    unlocked = false;
    return result;
  });
  await expect(
    hierarchy.encryptSnapshot(context.identity, context.workplaceId, snapshot),
  ).rejects.toThrow('locked');
});
it('retains interrupted enrollment for explicit reconciliation instead of silently replacing roots', async () => {
  const context = memoryKeyHierarchy();
  jest
    .mocked(context.state.write)
    .mockImplementationOnce(async (scope, value) => {
      context.ciphertext.set(scope, value);
    })
    .mockRejectedValueOnce(new Error('disk full'));
  await expect(context.hierarchy.beginUser('alice', 'phone')).rejects.toThrow('disk full');
  expect(context.deviceTags.size).toBe(1);
  expect(context.ciphertext.size).toBe(1); // Public enrollment marker survived.
  await expect(context.hierarchy.describeSetup('alice', 'phone')).resolves.toMatchObject({
    user: 'interrupted',
  });
  await expect(context.hierarchy.beginUser('alice', 'phone')).rejects.toThrow(
    'explicitly discarded',
  );
  await context.hierarchy.discardUnconfirmedUser('alice', 'phone');
  const credential = await context.hierarchy.beginUser('alice', 'phone');
  await context.hierarchy.confirmUserRecovery('alice', 'phone', credential);
  await expect(context.hierarchy.discardUnconfirmedUser('alice', 'phone')).rejects.toThrow(
    'established',
  );
  await context.hierarchy.logout('alice', 'phone');
  expect(context.deviceTags.size).toBe(0);
});
it('requires explicit discard when an unconfirmed Workplace secret was lost, and never discards an established key', async () => {
  const context = memoryKeyHierarchy();
  const userCredential = await context.hierarchy.beginUser('alice', 'phone');
  const identity = await context.hierarchy.confirmUserRecovery('alice', 'phone', userCredential);
  await context.hierarchy.enrollWorkplace(identity, 'books', 'creation');
  await context.hierarchy.discardUnconfirmedWorkplace(identity, 'books');
  const credential = await context.hierarchy.enrollWorkplace(identity, 'books', 'creation');
  await context.hierarchy.confirmWorkplaceRecovery(identity, 'books', credential);
  await expect(context.hierarchy.discardUnconfirmedWorkplace(identity, 'books')).rejects.toThrow(
    'established',
  );
});

it('pins both User key roles and recovers the same signing identity', async () => {
  const source = await enrolledKeyHierarchy();
  const saved = await source.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  expect(await userIdentityFingerprint(saved.publicIdentity)).toBe(
    source.userCredential.identityKeyId,
  );
  const substitute = await generateUserSigningPair();
  try {
    await expect(
      memoryKeyHierarchy().hierarchy.recoverUserDevice(
        source.userCredential,
        {
          ...saved,
          publicIdentity: {
            ...saved.publicIdentity,
            signingPublicKey: keyHex(substitute.publicKey),
          },
        },
        'fresh',
      ),
    ).rejects.toThrow();
  } finally {
    substitute.privateKey.fill(0);
  }
  const target = memoryKeyHierarchy();
  await target.hierarchy.recoverUserDevice(source.userCredential, saved, 'fresh');
  expect(
    (await target.hierarchy.exportUserRecoveryPackage('alice', 'fresh')).publicIdentity,
  ).toEqual(saved.publicIdentity);
});

it.each(['missing-device-key', 'orphan-device-key', 'total-installation-loss'])(
  'recovers from persistent external ciphertext after %s without replacing the User or DEK',
  async loss => {
    const { snapshot } = await seedSnapshotWorkplace();
    const source = await enrolledKeyHierarchy();
    const encrypted = await source.hierarchy.encryptSnapshot(
      source.identity,
      source.workplaceId,
      snapshot,
    );
    const saved = await source.hierarchy.exportUserRecoveryPackage('alice', 'phone');
    const workplaceKeys = await source.hierarchy.exportWorkplaceKeys(
      source.identity,
      source.workplaceId,
    );
    const directory = await mkdtemp(join(tmpdir(), 'ffb-recovery-source-'));
    try {
      const location = join(directory, 'ciphertext.json');
      await writeFile(location, JSON.stringify(saved), { mode: 0o600 });
      const backend: RecoveryArtifactSource = {
        loadUserRecoveryPackage: async userId =>
          userId === 'alice' ? JSON.parse(await readFile(location, 'utf8')) : null,
      };
      if (loss === 'missing-device-key') await source.eraseDeviceKeys();
      else if (loss === 'orphan-device-key') source.ciphertext.clear();
      else {
        source.ciphertext.clear();
        await source.eraseDeviceKeys();
      }
      const orphan = [...source.deviceTags.values()];
      expect(await source.hierarchy.inspectDeviceState('alice', 'phone')).toBe('recovery-required');
      if (loss !== 'total-installation-loss') {
        await expect(source.hierarchy.beginUser('alice', 'phone')).rejects.toThrow();
      }
      const recovered = await source.hierarchy.recoverUserFromSource(
        source.userCredential,
        backend,
        'fresh-installation',
      );
      expect(recovered.userKeyFingerprint).toBe(source.identity.userKeyFingerprint);
      if (loss !== 'missing-device-key')
        await source.hierarchy.installWorkplaceKeys(recovered, workplaceKeys);
      expect(
        await source.hierarchy.decryptSnapshot(recovered, source.workplaceId, encrypted),
      ).toEqual(snapshot);
      expect(
        (await source.hierarchy.exportWorkplaceKeys(recovered, source.workplaceId)).keyId,
      ).toBe(workplaceKeys.keyId);
      for (const key of orphan) expect([...source.deviceTags.values()]).toContain(key);
      expect(await source.hierarchy.inspectDeviceState('alice', 'fresh-installation')).toBe(
        'ready',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('leaves a known identity intact when the external recovery package is unavailable', async () => {
  const source = await enrolledKeyHierarchy();
  await source.eraseDeviceKeys();
  const before = JSON.stringify([...source.ciphertext.entries()]);
  await expect(
    source.hierarchy.recoverUserFromSource(
      source.userCredential,
      { loadUserRecoveryPackage: async () => null },
      'fresh',
    ),
  ).rejects.toThrow('ciphertext is unavailable');
  expect(JSON.stringify([...source.ciphertext.entries()])).toBe(before);
  expect(source.deviceTags.size).toBe(0);
  await expect(source.hierarchy.beginUser('alice', 'different-device')).rejects.toThrow(
    'requires recovery',
  );
});

it('rejects an otherwise valid forged dump encrypted to the public recovery recipient', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const source = await enrolledKeyHierarchy();
  const original = await source.hierarchy.exportWorkplaceKeys(source.identity, source.workplaceId);
  const fakeDek = new Uint8Array(32).fill(42);
  try {
    const fakeKeyId = await keyFingerprint(fakeDek);
    const recoveryEnvelope = await sealKeyEnvelope(fakeDek, original.recoveryPublicKey, {
      purpose: 'workplace-dump',
      userId: original.userId,
      workplaceId: original.workplaceId,
      keyId: fakeKeyId,
      recipientKeyId: await publicKeyId(original.recoveryPublicKey),
    });
    const fakeSnapshot = await encryptWorkplaceSnapshot(snapshot, fakeDek);
    const forged = createWorkplaceDump(
      { ...original, keyId: fakeKeyId, recoveryEnvelope },
      fakeSnapshot,
    );
    await expect(decryptWorkplaceDump(forged, source.workplaceCredential)).rejects.toThrow();
  } finally {
    fakeDek.fill(0);
  }
});

it('routes a missing local ciphertext file to recovery even when its locator survives', async () => {
  const source = await enrolledKeyHierarchy();
  const saved = await source.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  const read = jest.mocked(source.state.read).getMockImplementation()!;
  jest.mocked(source.state.read).mockImplementation(async scope => {
    if (
      scope === JSON.stringify(['user', 'alice', 'phone']) ||
      scope === JSON.stringify(['identity', 'alice'])
    )
      throw new MissingKeyStateError();
    return read(scope);
  });
  expect(await source.hierarchy.inspectDeviceState('alice', 'phone')).toBe('recovery-required');
  const recovered = await source.hierarchy.recoverUserFromSource(
    source.userCredential,
    {
      loadUserRecoveryPackage: async () => saved,
    },
    'fresh',
  );
  expect(recovered.userKeyFingerprint).toBe(source.identity.userKeyFingerprint);
  expect(await source.hierarchy.inspectDeviceState('alice', 'fresh')).toBe('ready');
});
