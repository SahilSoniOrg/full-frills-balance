import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { LocalKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import type { KeyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import type { NativeKeyOperations } from '@/src/services/backup/nativeKeyOperations';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import type { RecoveryCredential as LegacyCredential } from '@/src/testing/keyCryptoReference/keyEnvelopes';
import { decryptWorkplaceDump } from '@/src/testing/keyCryptoReference/workplaceDump';
import { createWorkplaceDump } from '@/src/services/backup/workplaceDump';
import {
  createLocalRecoveryPackage,
  verifyLocalRecoveryPackage,
} from '@/src/services/backup/localRecoveryPackage';
import {
  enableTestCrypto,
  seedSnapshotWorkplace,
} from '@/src/services/backup/__tests__/snapshotTestHelpers';
import { enrolledKeyHierarchy } from '@/src/services/backup/__tests__/keyHierarchyTestHelpers';
import { resetDatabase } from '@/src/testing/resetDatabase';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
class Host {
  private process: ChildProcessWithoutNullStreams;
  private pending: { resolve(value: unknown): void; reject(error: Error): void }[] = [];
  constructor() {
    if (!process.env.FFB_NATIVE_CRYPTO_HOST_BIN)
      throw new Error('Run test:native-key-crypto to build the real native core');
    this.process = spawn(process.env.FFB_NATIVE_CRYPTO_HOST_BIN, [], { stdio: 'pipe' });
    createInterface({ input: this.process.stdout }).on('line', line => {
      const result: { result?: unknown; error?: string } = JSON.parse(line);
      const waiter = this.pending.shift();
      if (result.error) waiter?.reject(new Error('Native operation rejected'));
      else waiter?.resolve(result.result);
    });
    this.process.stderr.resume();
  }
  execute(operation: string, request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.process.stdin.write(`${JSON.stringify({ operation, request })}\n`);
    });
  }
  async close() {
    this.process.stdin.end();
    await new Promise<void>(resolve => this.process.once('exit', () => resolve()));
  }
}
let host: Host;
beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
  host = new Host();
});
afterEach(async () => {
  await host.close();
});
function target() {
  const records = new Map<string, unknown>();
  const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
  const state: KeyCiphertextStateStore = {
    read: jest.fn(async scope => (records.has(scope) ? clone(records.get(scope)) : null)),
    write: jest.fn(async (scope, value) => {
      records.set(scope, clone(value));
    }),
    remove: jest.fn(async scope => {
      records.delete(scope);
    }),
  };
  const forbidden = jest.fn(async (): Promise<never> => {
    throw new Error('Raw key access is forbidden');
  });
  const crypto: NativeKeyOperations = {
    execute: (op, request) => host.execute(op, request),
    importCredential: forbidden,
    writeCredential: forbidden,
    retainCredential: forbidden,
    releaseCredential: forbidden,
    clearCredentials: async () => undefined,
  };
  return {
    hierarchy: new LocalKeyHierarchy(state, () => undefined, crypto),
    state,
    records,
    forbidden,
  };
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
it('native recovery accepts existing V1 User credentials/envelopes and decrypts an existing format-2 snapshot payload unchanged', async () => {
  const { snapshot, workplaceId } = await seedSnapshotWorkplace();
  const legacy = await enrolledKeyHierarchy(workplaceId);
  const envelope = await legacy.hierarchy.encryptSnapshot(legacy.identity, workplaceId, snapshot);
  const user = await legacy.hierarchy.exportUserRecoveryPackage('alice', 'phone');
  const keys = await legacy.hierarchy.exportWorkplaceKeys(legacy.identity, workplaceId);
  const credential = (await host.execute('test.importCredential', {
    credential: legacy.userCredential,
  })) as RecoveryCredential;
  const t = target();
  const identity = await t.hierarchy.recoverUserDevice(credential, user, 'replacement');
  expect(identity.userKeyFingerprint).toBe(legacy.identity.userKeyFingerprint);
  await t.hierarchy.installWorkplaceKeys(identity, keys);
  expect(await t.hierarchy.decryptSnapshot(identity, workplaceId, envelope)).toEqual(snapshot);
  await expect(t.hierarchy.encryptSnapshot(identity, workplaceId, snapshot)).rejects.toThrow(
    'writer handover',
  );
  expect(t.forbidden).not.toHaveBeenCalled();
});
it('the old V1 recovery derivation and AES implementation can decrypt a native-created emergency dump', async () => {
  const s = await source();
  const envelope = await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  const credential = (await host.execute(
    'test.exportCredential',
    s.workplaceCredential,
  )) as LegacyCredential;
  const keys = await s.hierarchy.exportWorkplaceKeys(s.identity, s.workplaceId);
  expect(await decryptWorkplaceDump(createWorkplaceDump(keys, envelope), credential)).toEqual(
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
it('retains a failed encryption reservation and enforces the writer/cap before another native operation', async () => {
  const s = await source();
  const invalid = { ...s.snapshot, workplace: { ...s.snapshot.workplace, id: 'unrelated' } };
  await expect(s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, invalid)).rejects.toThrow();
  await s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot);
  const keys = await s.hierarchy.exportWorkplaceKeys(s.identity, s.workplaceId);
  expect(keys.encryptionInvocations).toBe(2);
  const scope = JSON.stringify(['workplace', s.identity.userId, s.workplaceId]);
  s.records.set(scope, { ...keys, encryptionInvocations: 2 ** 20 });
  await expect(s.hierarchy.encryptSnapshot(s.identity, s.workplaceId, s.snapshot)).rejects.toThrow(
    'budget exhausted',
  );
});
it('validates original recovery-file secrets natively and rejects altered checksums or metadata', async () => {
  const s = await source();
  const saved = (await host.execute('test.exportCredential', s.userCredential)) as LegacyCredential;
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
it('an interrupted native User creation requires explicit discard and never silently regenerates a root', async () => {
  const t = target();
  jest
    .mocked(t.state.write)
    .mockImplementationOnce(async (scope, value) => {
      t.records.set(scope, value);
    })
    .mockRejectedValueOnce(new Error('checkpoint failed'));
  await expect(t.hierarchy.beginUser('interrupted', 'phone')).rejects.toThrow('checkpoint failed');
  await expect(t.hierarchy.describeSetup('interrupted', 'phone')).resolves.toMatchObject({
    user: 'interrupted',
  });
  await expect(t.hierarchy.beginUser('interrupted', 'phone')).rejects.toThrow(
    'explicitly discarded',
  );
  await t.hierarchy.discardUnconfirmedUser('interrupted', 'phone');
  expect((await t.hierarchy.beginUser('interrupted', 'phone')).format).toBe(
    'full-frills-recovery-handle',
  );
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
