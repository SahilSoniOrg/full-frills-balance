import { closeNativeHost, enrolledKeyHierarchy, memoryKeyHierarchy } from './nativeTestContext';
import { webcrypto } from 'node:crypto';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { LocalKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import {
  identityScope,
  userScope,
  type LocalUserKeys,
} from '@/src/services/backup/keyHierarchyRecords';
import { generateUserSigningPair } from './envelopeTestTools';
import { keyHex } from '@/src/services/backup/keyEncoding';
import { userIdentityFingerprint } from '@/src/services/backup/userIdentity';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissingKeyStateError } from '@/src/utils/keyOperationError';
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
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  await resetDatabase();
});

it.each([
  ['new', 'not-started'],
  ['pending', 'pending'],
  ['ready', 'ready'],
  ['interrupted', 'interrupted'],
  ['missing-device', 'recovery-required'],
  ['missing-ciphertext', 'recovery-required'],
  ['orphan-device', 'recovery-required'],
] as const)('classifies the production setup state for %s', async (stage, setup) => {
  const context = memoryKeyHierarchy();
  if (stage !== 'new') {
    const credential = await context.hierarchy.beginUser('alice', 'phone');
    if (stage !== 'pending' && stage !== 'interrupted')
      await context.hierarchy.confirmUserRecovery('alice', 'phone', credential);
  }
  if (stage === 'interrupted') await context.state.remove(userScope('alice', 'phone'));
  if (stage === 'missing-device') await context.eraseDeviceKeys();
  if (stage === 'orphan-device') context.ciphertext.clear();
  if (stage === 'missing-ciphertext') {
    const read = jest.mocked(context.state.read).getMockImplementation()!;
    jest.mocked(context.state.read).mockImplementation(async scope => {
      if (scope === userScope('alice', 'phone')) throw new MissingKeyStateError();
      return read(scope);
    });
  }
  await expect(context.hierarchy.describeSetup('alice', 'phone')).resolves.toMatchObject({
    user: setup,
  });
});

it('opens Device → User → Workplace after restart and exposes only public/encrypted state to JS', async () => {
  const context = await enrolledKeyHierarchy();
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
  await expect(
    restarted.describeSetup(
      context.identity.userId,
      context.identity.registeredDeviceId,
      context.workplaceId,
    ),
  ).resolves.toMatchObject({ user: 'ready', workplace: 'ready' });
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
    context.hierarchy.confirmUserRecovery('alice', 'phone', {
      ...credential,
      handle: '00'.repeat(32),
    }),
  ).rejects.toThrow();
  const identity = await context.hierarchy.confirmUserRecovery('alice', 'phone', credential);
  const dumpCredential = await context.hierarchy.enrollWorkplace(identity, 'books', 'creation');
  await context.hierarchy.confirmWorkplaceRecovery(identity, 'books', dumpCredential);
  const original = await context.hierarchy.exportWorkplaceKeys(identity, 'books');
  await expect(context.hierarchy.enrollWorkplace(identity, 'books', 'creation')).rejects.toThrow(
    'already exists',
  );
  expect((await context.hierarchy.exportWorkplaceKeys(identity, 'books')).keyId).toBe(
    original.keyId,
  );
});
it('recovers the SAME User into independent Device keys and installs its existing Workplace keys', async () => {
  const source = await enrolledKeyHierarchy();
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
    (await replacement.hierarchy.exportWorkplaceKeys(identity, source.workplaceId)).keyId,
  ).toBe((await source.hierarchy.exportWorkplaceKeys(source.identity, source.workplaceId)).keyId);
  expect([...replacement.deviceTags.values()][0]).not.toEqual([...source.deviceTags.values()][0]);
});
it('rejects wrong recovery credentials and altered envelopes without replacing identity', async () => {
  const source = await enrolledKeyHierarchy();
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
        recoveryEnvelope: {
          ...saved.recoveryEnvelope,
          encapsulatedKey: '00'.repeat(32),
        },
      },
      'new',
    ),
  ).rejects.toThrow();
  expect(replacement.deviceTags.size).toBe(0);
  expect(replacement.ciphertext.size).toBe(0);
});
it('checks app lock after awaited native operations and fails closed without a shell', async () => {
  setKeyAccessAllowed(false);
  expect(assertKeyAccessAllowed).toThrow('Unlock');
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
    hierarchy.describeSetup(context.identity.userId, context.identity.registeredDeviceId),
  ).rejects.toThrow('locked');
});
it('can revoke Device access while locked, after a rejected queued operation', async () => {
  const context = await enrolledKeyHierarchy();
  const locked = new LocalKeyHierarchy(
    context.state,
    () => {
      throw new Error('locked');
    },
    context.crypto,
  );
  const denied = locked.describeSetup(context.identity.userId, context.identity.registeredDeviceId);
  const rejected = expect(denied).rejects.toThrow('locked');
  const logout = locked.logout(context.identity.userId, context.identity.registeredDeviceId);
  await rejected;
  await logout;
  expect(context.deviceTags.size).toBe(0);
  await expect(
    context.state.read(
      JSON.stringify(['user', context.identity.userId, context.identity.registeredDeviceId]),
    ),
  ).resolves.toBeNull();
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
it('never deletes a Device key unless its pending enrollment marker proves the step is unfinished', async () => {
  const context = memoryKeyHierarchy();
  await context.hierarchy.beginUser('alice', 'phone');
  context.ciphertext.delete(identityScope('alice'));
  await expect(context.hierarchy.discardUnconfirmedUser('alice', 'phone')).rejects.toThrow(
    'enrollment marker',
  );
  context.ciphertext.delete(userScope('alice', 'phone'));
  await context.hierarchy.discardUnconfirmedUser('alice', 'phone');
  expect(context.deviceTags.size).toBe(1);
});
it('keeps an interrupted discard retryable by removing the enrollment marker last', async () => {
  const context = memoryKeyHierarchy();
  await context.hierarchy.beginUser('alice', 'phone');
  jest.mocked(context.state.remove).mockRejectedValueOnce(new Error('disk full'));
  await expect(context.hierarchy.discardUnconfirmedUser('alice', 'phone')).rejects.toThrow(
    'disk full',
  );
  expect(context.deviceTags.size).toBe(0);
  expect(context.ciphertext.has(identityScope('alice'))).toBe(true);
  await context.hierarchy.discardUnconfirmedUser('alice', 'phone');
  expect(context.ciphertext.size).toBe(0);
  const credential = await context.hierarchy.beginUser('alice', 'phone');
  await context.hierarchy.confirmUserRecovery('alice', 'phone', credential);
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
    const source = await enrolledKeyHierarchy();
    const saved = await source.hierarchy.exportUserRecoveryPackage('alice', 'phone');
    const workplaceKeys = await source.hierarchy.exportWorkplaceKeys(
      source.identity,
      source.workplaceId,
    );
    const directory = await mkdtemp(join(tmpdir(), 'ffb-recovery-source-'));
    try {
      const location = join(directory, 'ciphertext.json');
      await writeFile(location, JSON.stringify(saved), { mode: 0o600 });
      if (loss === 'missing-device-key') await source.eraseDeviceKeys();
      else if (loss === 'orphan-device-key') source.ciphertext.clear();
      else {
        source.ciphertext.clear();
        await source.eraseDeviceKeys();
      }
      const orphan = [...source.deviceTags.values()];
      expect((await source.hierarchy.describeSetup('alice', 'phone')).user).toBe(
        loss === 'total-installation-loss' ? 'not-started' : 'recovery-required',
      );
      if (loss !== 'total-installation-loss') {
        await expect(source.hierarchy.beginUser('alice', 'phone')).rejects.toThrow();
      }
      const recovered = await source.hierarchy.recoverUserDevice(
        source.userCredential,
        JSON.parse(await readFile(location, 'utf8')),
        'fresh-installation',
      );
      expect(recovered.userKeyFingerprint).toBe(source.identity.userKeyFingerprint);
      if (loss !== 'missing-device-key')
        await source.hierarchy.installWorkplaceKeys(recovered, workplaceKeys);
      expect(
        (await source.hierarchy.exportWorkplaceKeys(recovered, source.workplaceId)).keyId,
      ).toBe(workplaceKeys.keyId);
      for (const key of orphan) expect([...source.deviceTags.values()]).toContain(key);
      expect((await source.hierarchy.describeSetup('alice', 'fresh-installation')).user).toBe(
        'ready',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('rejects missing recovery ciphertext without replacing a known identity', async () => {
  const source = await enrolledKeyHierarchy();
  await source.eraseDeviceKeys();
  const before = JSON.stringify([...source.ciphertext.entries()]);
  await expect(
    source.hierarchy.recoverUserDevice(source.userCredential, null, 'fresh'),
  ).rejects.toThrow();
  expect(JSON.stringify([...source.ciphertext.entries()])).toBe(before);
  expect(source.deviceTags.size).toBe(0);
  await expect(source.hierarchy.beginUser('alice', 'different-device')).rejects.toThrow(
    'requires recovery',
  );
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
  expect((await source.hierarchy.describeSetup('alice', 'phone')).user).toBe('recovery-required');
  const recovered = await source.hierarchy.recoverUserDevice(source.userCredential, saved, 'fresh');
  expect(recovered.userKeyFingerprint).toBe(source.identity.userKeyFingerprint);
  expect((await source.hierarchy.describeSetup('alice', 'fresh')).user).toBe('ready');
});

it('finishes the User record and identity marker before reporting an intervening lock', async () => {
  const source = await enrolledKeyHierarchy();
  const saved = await source.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  let allowed = true;
  const target = memoryKeyHierarchy(() => {
    if (!allowed) throw new Error('locked');
  });
  const write = jest.mocked(target.state.write).getMockImplementation()!;
  jest.mocked(target.state.write).mockImplementation(async (scope, value) => {
    await write(scope, value);
    allowed = false;
  });
  await expect(
    target.hierarchy.recoverUserDevice(source.userCredential, saved, 'replacement'),
  ).rejects.toThrow('locked');
  expect(target.ciphertext.get(userScope('alice', 'replacement'))).toMatchObject({
    recoveryConfirmed: true,
  });
  expect(target.ciphertext.get(JSON.stringify(['identity', 'alice']))).toMatchObject({
    recoveryConfirmed: true,
  });
  allowed = true;
  expect(await target.hierarchy.describeSetup('alice', 'replacement')).toMatchObject({
    user: 'ready',
  });
  expect(target.deviceTags.size).toBe(1);
});

it.each(['FFB_KEY_RECOVERY_REQUIRED', 'FFB_KEY_VAULT_UNAVAILABLE'] as const)(
  'distinguishes permanent and temporary native vault failure: %s',
  async code => {
    const c = await enrolledKeyHierarchy();
    jest.spyOn(c.crypto, 'hasKey').mockRejectedValueOnce(new Error(`native: ${code}`));
    if (code === 'FFB_KEY_RECOVERY_REQUIRED')
      await expect(c.hierarchy.describeSetup('alice', 'phone')).resolves.toMatchObject({
        user: 'recovery-required',
      });
    else await expect(c.hierarchy.describeSetup('alice', 'phone')).rejects.toThrow(code);
  },
);
