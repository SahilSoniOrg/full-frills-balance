import { resetDatabase } from '@/src/testing/resetDatabase';
import { enableTestCrypto, seedSnapshotWorkplace } from './snapshotTestHelpers';
import { enrolledKeyHierarchy, memoryKeyHierarchy } from './keyHierarchyTestHelpers';
import {
  LocalKeyHierarchy,
  type LocalUserKeys,
} from '@/src/testing/keyCryptoReference/localKeyHierarchy';
import {
  decryptWorkplaceSnapshot,
  encryptWorkplaceSnapshot,
  keyFingerprint,
} from '@/src/testing/keyCryptoReference/encryptedSnapshot';
import {
  openKeyEnvelope,
  sealKeyEnvelope,
  publicKeyId,
} from '@/src/testing/keyCryptoReference/keyEnvelopes';
import { keyHex } from '../keyEncoding';
import {
  userIdentityFingerprint,
  generateUserSigningPair,
} from '@/src/testing/keyCryptoReference/userIdentity';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissingKeyStateError } from '../keyStateErrors';
import type { RecoveryArtifactSource } from '../recoveryArtifactSource';
import {
  createWorkplaceDump,
  decryptWorkplaceDump,
} from '@/src/testing/keyCryptoReference/workplaceDump';
import { assertKeyAccessAllowed, setKeyAccessAllowed } from '../keyAccessPolicy';

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

it('opens Device → User → Workplace after restart and persists no readable User key or DEK', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const context = await enrolledKeyHierarchy();
  let borrowed: Uint8Array | undefined;
  let dekHex = '';
  const encrypted = await context.hierarchy.withWorkplaceKey(
    context.identity,
    context.workplaceId,
    async dek => {
      borrowed = dek;
      dekHex = keyHex(dek);
      return encryptWorkplaceSnapshot(snapshot, dek);
    },
    true,
  );
  expect(borrowed!.every(byte => byte === 0)).toBe(true);
  const user = [...context.ciphertext.values()].find(
    value => (value as LocalUserKeys).deviceEnvelope,
  ) as LocalUserKeys;
  const deviceKey = await context.vault.load('alice', 'phone');
  const bytes = await openKeyEnvelope(user.deviceEnvelope, deviceKey!, user.deviceEnvelope.context);
  const bundle = JSON.parse(new TextDecoder().decode(bytes));
  const persisted = JSON.stringify([...context.ciphertext.values()]);
  expect(persisted).not.toContain(bundle.privateKey);
  expect(persisted).not.toContain(bundle.signingPrivateKey);
  expect(bundle.publicIdentity.signingAlgorithm).toBe('Ed25519');
  expect(persisted).not.toContain(dekHex);
  expect(persisted).not.toContain(context.userCredential.phrase);
  expect(persisted).not.toContain(context.workplaceCredential.phrase);
  expect(context.deviceSecrets.size).toBe(1);
  expect(keyHex(deviceKey!)).not.toBe(bundle.privateKey);
  bytes.fill(0);
  deviceKey!.fill(0);
  const restarted = new LocalKeyHierarchy(context.state, context.vault, () => undefined);
  expect(
    await restarted.withWorkplaceKey(context.identity, context.workplaceId, dek =>
      decryptWorkplaceSnapshot(encrypted, dek),
    ),
  ).toEqual(snapshot);
});
it('requires separate external save/readback confirmations and never invents missing Workplace keys', async () => {
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
    context.hierarchy.confirmUserRecovery('alice', 'phone', { ...credential, phrase: 'wrong' }),
  ).rejects.toThrow('phrase');
  const identity = await context.hierarchy.confirmUserRecovery('alice', 'phone', credential);
  await expect(
    context.hierarchy.withWorkplaceKey(identity, 'books', async () => undefined),
  ).rejects.toThrow('Enroll');
  const dumpCredential = await context.hierarchy.enrollWorkplace(identity, 'books', 'creation');
  await expect(
    context.hierarchy.withWorkplaceKey(identity, 'books', async () => undefined),
  ).rejects.toThrow('Confirm');
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
  const encrypted = await source.hierarchy.withWorkplaceKey(
    source.identity,
    source.workplaceId,
    dek => encryptWorkplaceSnapshot(snapshot, dek),
    true,
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
    await replacement.hierarchy.withWorkplaceKey(identity, source.workplaceId, dek =>
      decryptWorkplaceSnapshot(encrypted, dek),
    ),
  ).toEqual(snapshot);
  expect([...replacement.deviceSecrets.values()][0]).not.toEqual(
    [...source.deviceSecrets.values()][0],
  );
  await expect(
    replacement.hierarchy.withWorkplaceKey(
      identity,
      source.workplaceId,
      async () => undefined,
      true,
    ),
  ).rejects.toThrow('handover');
});
it('rejects cross-User/Device/Workplace substitution, wrong credentials, and altered envelopes', async () => {
  const source = await enrolledKeyHierarchy();
  await expect(
    source.hierarchy.withWorkplaceKey(
      { ...source.identity, userId: 'bob' },
      source.workplaceId,
      async () => undefined,
    ),
  ).rejects.toThrow();
  await expect(
    source.hierarchy.withWorkplaceKey(
      { ...source.identity, registeredDeviceId: 'wrong' },
      source.workplaceId,
      async () => undefined,
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
  ).rejects.toThrow('identity');
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
  expect(replacement.deviceSecrets.size).toBe(0);
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
    source.hierarchy.withWorkplaceKey(source.identity, source.workplaceId, async () => undefined),
  ).rejects.toThrow('context');
});
it('Workplace dump recovery returns only readable data and works without User or Device secrets', async () => {
  const { snapshot } = await seedSnapshotWorkplace();
  const context = await enrolledKeyHierarchy();
  const encrypted = await context.hierarchy.withWorkplaceKey(
    context.identity,
    context.workplaceId,
    dek => encryptWorkplaceSnapshot(snapshot, dek),
    true,
  );
  const dump = createWorkplaceDump(
    await context.hierarchy.exportWorkplaceKeys(context.identity, context.workplaceId),
    encrypted,
  );
  expect(dump).not.toHaveProperty('memberEnvelope');
  expect(dump).not.toHaveProperty('userPrivateKey');
  context.ciphertext.clear();
  context.deviceSecrets.clear();
  expect(await decryptWorkplaceDump(dump, context.workplaceCredential)).toEqual(snapshot);
  await expect(decryptWorkplaceDump(dump, context.userCredential)).rejects.toThrow('identity');
  await expect(
    decryptWorkplaceDump({ ...dump, workplaceId: 'other' }, context.workplaceCredential),
  ).rejects.toThrow();
});
it('burns durable encryption reservations before use, retains failures, and blocks exhausted budgets', async () => {
  const context = await enrolledKeyHierarchy();
  const scope = JSON.stringify(['workplace', 'alice', context.workplaceId]);
  await expect(
    context.hierarchy.withWorkplaceKey(
      context.identity,
      context.workplaceId,
      async () => {
        throw new Error('encryption interrupted');
      },
      true,
    ),
  ).rejects.toThrow('interrupted');
  const keys = await context.hierarchy.exportWorkplaceKeys(context.identity, context.workplaceId);
  expect(keys.encryptionInvocations).toBe(1);
  context.ciphertext.set(scope, { ...keys, encryptionInvocations: 2 ** 20 });
  const use = jest.fn();
  await expect(
    context.hierarchy.withWorkplaceKey(context.identity, context.workplaceId, use, true),
  ).rejects.toThrow('budget');
  expect(use).not.toHaveBeenCalled();
  expect(
    await context.hierarchy.withWorkplaceKey(
      context.identity,
      context.workplaceId,
      async dek => dek.length,
    ),
  ).toBe(32);
});
it('checks the existing app lock after awaited key reads, clears borrowed keys, and fails closed without a shell', async () => {
  setKeyAccessAllowed(false);
  expect(assertKeyAccessAllowed).toThrow('Unlock');
  const context = await enrolledKeyHierarchy();
  let unlocked = true;
  const hierarchy = new LocalKeyHierarchy(context.state, context.vault, () => {
    if (!unlocked) throw new Error('locked');
  });
  const load = context.vault.load;
  let borrowed: Uint8Array | undefined;
  jest.spyOn(context.vault, 'load').mockImplementationOnce(async (userId, deviceId) => {
    borrowed = (await load(userId, deviceId)) ?? undefined;
    unlocked = false;
    return borrowed ?? null;
  });
  const use = jest.fn();
  await expect(
    hierarchy.withWorkplaceKey(context.identity, context.workplaceId, use),
  ).rejects.toThrow('locked');
  expect(use).not.toHaveBeenCalled();
  expect(borrowed!.every(byte => byte === 0)).toBe(true);
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
  expect(context.deviceSecrets.size).toBe(1);
  expect(context.ciphertext.size).toBe(1); // Public enrollment marker survived.
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
  expect(context.deviceSecrets.size).toBe(0);
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
          publicIdentity: { ...saved.publicIdentity, signingPublicKey: substitute.publicKey },
        },
        'fresh',
      ),
    ).rejects.toThrow('identity mismatch');
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
    const encrypted = await source.hierarchy.withWorkplaceKey(
      source.identity,
      source.workplaceId,
      dek => encryptWorkplaceSnapshot(snapshot, dek),
      true,
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
      if (loss === 'missing-device-key') source.deviceSecrets.clear();
      else if (loss === 'orphan-device-key') source.ciphertext.clear();
      else {
        source.ciphertext.clear();
        source.deviceSecrets.clear();
      }
      const orphan = [...source.deviceSecrets.values()].map(keyHex);
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
        await source.hierarchy.withWorkplaceKey(recovered, source.workplaceId, dek =>
          decryptWorkplaceSnapshot(encrypted, dek),
        ),
      ).toEqual(snapshot);
      expect(
        (await source.hierarchy.exportWorkplaceKeys(recovered, source.workplaceId)).keyId,
      ).toBe(workplaceKeys.keyId);
      for (const key of orphan)
        expect([...source.deviceSecrets.values()].map(keyHex)).toContain(key);
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
  source.deviceSecrets.clear();
  const before = JSON.stringify([...source.ciphertext.entries()]);
  await expect(
    source.hierarchy.recoverUserFromSource(
      source.userCredential,
      { loadUserRecoveryPackage: async () => null },
      'fresh',
    ),
  ).rejects.toThrow('ciphertext is unavailable');
  expect(JSON.stringify([...source.ciphertext.entries()])).toBe(before);
  expect(source.deviceSecrets.size).toBe(0);
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
    await expect(decryptWorkplaceDump(forged, source.workplaceCredential)).rejects.toThrow(
      'identity mismatch',
    );
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
