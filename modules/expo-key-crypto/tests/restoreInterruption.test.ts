import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { closeNativeHost, memoryKeyHierarchy } from './nativeTestContext';
import { LocalKeyHierarchy, localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import type { KeyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import {
  userScope,
  workplaceScope,
  type LocalUserKeys,
} from '@/src/services/backup/keyHierarchyRecords';
import { EncryptedRestoreWorkflow } from '@/src/services/backup/encryptedRestoreWorkflow';
import type { EncryptionSetupSession } from '@/src/services/backup/encryptionSetupStore';
import { createEncryptedBackupZip } from '@/src/services/sync/encryptedBackupActions';
import { restoreBackup } from '@/src/services/sync/restoreBackup';
import { parseBackupZip } from '@/src/services/sync/backupFile';
import { parseRowManifest } from '@/src/services/crypto/protocol/rowEnvelope';
import { hashManifest } from '@/src/services/crypto/protocol/manifestBytes';
import { keyHex } from '@/src/services/backup/keyEncoding';
import { rowSource } from '@/src/services/sync/rowSource';
import { database } from '@/src/data/database/Database';
import * as persistence from '@/src/data/database/flushPersistence';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { seedKeyTestWorkplace } from '@/src/services/backup/__tests__/keyTestHelpers';
import { setKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';
import { transactionRawRebuildQueries } from '@/src/data/repositories/raw/TransactionRawRebuildQueries';
import Account from '@/src/data/models/Account';
import { AccountType } from '@/src/types/enums';
import type { WorkplaceId, AccountId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));

let directory: string;
beforeEach(async () => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  setKeyAccessAllowed(true);
  await resetDatabase();
  directory = await mkdtemp(join(tmpdir(), 'ffb-restore-checkpoints-'));
});
afterEach(async () => {
  jest.restoreAllMocks();
  setKeyAccessAllowed(false);
  await closeNativeHost();
  await rm(directory, { recursive: true, force: true });
});

// Real filesystem checkpoints (public metadata/ciphertext only). Reconstructed owners
// reopen these files, never seed expected successful state. The host vault stays alive;
// this is store/engine integration, not evidence of native process-kill durability.
function files() {
  const filename = (scope: string) => join(directory, Buffer.from(scope).toString('hex'));
  const read = async <T>(scope: string): Promise<T | null> => {
    try {
      return JSON.parse(await readFile(filename(scope), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };
  const write = async (scope: string, value: unknown) => {
    await writeFile(filename(scope), JSON.stringify(value));
  };
  const remove = async (scope: string) => {
    await rm(filename(scope), { force: true });
  };
  return { read, write, remove };
}

async function fixture() {
  const source = memoryKeyHierarchy();
  const userCredential = await source.hierarchy.beginUser('alice', 'source');
  const identity = await source.hierarchy.confirmUserRecovery('alice', 'source', userCredential);
  const { workplaceId, journal } = await seedKeyTestWorkplace();
  await journalPersistenceRepository.put(
    {
      journalId: journal.id,
      metadata: {
        importSource: 'restore-verification',
        metadataJson: JSON.stringify({ referenceNumber: 'SYNTHETIC-INTEGRATION' }),
      },
    },
    workplaceId,
  );
  const credential = await source.hierarchy.enrollWorkplace(identity, workplaceId, 'local-upgrade');
  await source.hierarchy.confirmWorkplaceRecovery(identity, workplaceId, credential);
  let hierarchy = source.hierarchy;
  jest
    .spyOn(localKeyHierarchy, 'exportWorkplaceKeys')
    .mockImplementation((...args) => hierarchy.exportWorkplaceKeys(...args));
  jest
    .spyOn(localKeyHierarchy, 'exportUserRecoveryPackage')
    .mockImplementation((...args) => hierarchy.exportUserRecoveryPackage(...args));
  jest
    .spyOn(localKeyHierarchy, 'encryptRows')
    .mockImplementation((...args) => hierarchy.encryptRows(...args));
  jest
    .spyOn(localKeyHierarchy, 'signRowManifest')
    .mockImplementation((...args) => hierarchy.signRowManifest(...args));
  jest
    .spyOn(localKeyHierarchy, 'describeSetup')
    .mockImplementation((...args) => hierarchy.describeSetup(...args));
  jest
    .spyOn(localKeyHierarchy, 'validateRecoveryCredential')
    .mockImplementation((...args) => hierarchy.validateRecoveryCredential(...args));
  jest
    .spyOn(localKeyHierarchy, 'recoverUserDevice')
    .mockImplementation((...args) => hierarchy.recoverUserDevice(...args));
  jest
    .spyOn(localKeyHierarchy, 'decryptRows')
    .mockImplementation((...args) => hierarchy.decryptRows(...args));
  jest
    .spyOn(localKeyHierarchy, 'preflightWorkplaceRestore')
    .mockImplementation((...args) => hierarchy.preflightWorkplaceRestore(...args));
  jest
    .spyOn(localKeyHierarchy, 'installWorkplaceKeys')
    .mockImplementation((...args) => hierarchy.installWorkplaceKeys(...args));
  const archive = await createEncryptedBackupZip(identity, workplaceId);
  const differentArchive = await createEncryptedBackupZip(identity, workplaceId);
  const expected = await rowSource.readWorkplaceRows(workplaceId);
  const parsed = parseBackupZip(archive);
  const manifest = parseRowManifest(parsed.manifest, {
    workplaceId,
    keyId: parsed.workplaceKeys.keyId,
    authorUserId: identity.userId,
  });
  const receipt = keyHex(await hashManifest(manifest.fields));
  await resetDatabase();
  const target = memoryKeyHierarchy();
  const disk = files();
  const state: KeyCiphertextStateStore = {
    read: disk.read,
    write: disk.write,
    remove: disk.remove,
  };
  const freshDeviceId = jest.fn(() => 'recovery-device');
  const dependencies = {
    pending: {
      load: () => disk.read<string>('pending'),
      save: (id: string) => disk.write('pending', id),
      clear: () => disk.remove('pending'),
    },
    session: {
      loadSession: () => disk.read<EncryptionSetupSession>('session'),
      saveSession: (session: EncryptionSetupSession) => disk.write('session', session),
    },
    hierarchy: localKeyHierarchy,
    freshDeviceId,
    restore: restoreBackup,
  };
  const reopen = () => {
    hierarchy = new LocalKeyHierarchy(state, () => undefined, target.crypto);
    return new EncryptedRestoreWorkflow(dependencies);
  };
  return {
    source,
    target,
    state,
    archive,
    differentArchive,
    expected,
    receipt,
    workplaceId,
    dependencies,
    reopen,
    workflow: reopen(),
    input: { archive, credential: userCredential },
    keyId: parsed.workplaceKeys.keyId,
  };
}

it.each(['publication', 'durability', 'keys', 'session', 'cleanup'] as const)(
  'retries a real restore after %s fails without replacing identity or financial records',
  async boundary => {
    const h = await fixture();
    const injected = new Error(`injected:${boundary}`);
    let reached = 0;
    const fail = async (): Promise<never> => {
      reached++;
      throw injected;
    };
    if (boundary === 'publication') jest.spyOn(database, 'batch').mockImplementationOnce(fail);
    if (boundary === 'durability')
      jest.spyOn(persistence, 'flushDatabasePersistence').mockImplementationOnce(fail);
    if (boundary === 'keys')
      jest.mocked(localKeyHierarchy.installWorkplaceKeys).mockImplementationOnce(fail);
    if (boundary === 'session')
      jest.spyOn(h.dependencies.session, 'saveSession').mockImplementationOnce(fail);
    if (boundary === 'cleanup')
      jest.spyOn(h.dependencies.pending, 'clear').mockImplementationOnce(fail);
    await expect(h.workflow.restoreSelectedBackup(h.input)).rejects.toBe(injected);
    expect(reached).toBe(1);
    expect(await h.dependencies.pending.load()).toBe('recovery-device');
    const user = (await h.state.read(userScope('alice', 'recovery-device'))) as LocalUserKeys;
    expect(user.userKeyFingerprint).toBe(h.input.credential.identityKeyId);
    const deviceTags = [...h.target.deviceTags];
    expect(deviceTags).toHaveLength(1);
    const published = await workplaceRepository.find(h.workplaceId);
    expect(published?.rowRestoreManifestHash ?? null).toBe(
      boundary === 'publication' ? null : h.receipt,
    );
    const rowsBefore = published ? await rowSource.readWorkplaceRows(h.workplaceId) : [];
    if (boundary === 'publication') {
      for (const table of ['accounts', 'journals', 'transactions', 'audit_logs'])
        expect(await database.get(table).query().fetchCount()).toBe(0);
    }
    expect((await h.state.read(workplaceScope('alice', h.workplaceId))) !== null).toBe(
      ['session', 'cleanup'].includes(boundary),
    );
    expect((await h.dependencies.session.loadSession()) !== null).toBe(boundary === 'cleanup');
    const remounted = h.reopen();
    if (boundary === 'keys') {
      await expect(
        remounted.restoreSelectedBackup({ ...h.input, archive: h.differentArchive }),
      ).rejects.toThrow('will not overwrite');
      expect(await rowSource.readWorkplaceRows(h.workplaceId)).toEqual(rowsBefore);
      expect((await workplaceRepository.find(h.workplaceId))!.rowRestoreManifestHash).toBe(
        h.receipt,
      );
    }
    const result = await remounted.restoreSelectedBackup(
      boundary === 'cleanup' ? { archive: h.archive } : h.input,
    );
    expect(result.warnings).toEqual([]);
    expect(result.identity).toEqual({
      userId: user.userId,
      registeredDeviceId: user.deviceId,
      userKeyFingerprint: user.userKeyFingerprint,
    });
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
    expect([...h.target.deviceTags]).toEqual(deviceTags);
    expect(await h.state.read(userScope('alice', 'recovery-device'))).toEqual(user);
    expect(await h.dependencies.pending.load()).toBeNull();
    expect(await h.dependencies.session.loadSession()).toMatchObject({
      deviceId: 'recovery-device',
      userId: 'alice',
      enrolledWorkplaces: [h.workplaceId],
    });
    expect((await workplaceRepository.find(h.workplaceId))!.rowRestoreManifestHash).toBe(h.receipt);
    const after = await rowSource.readWorkplaceRows(h.workplaceId);
    const primary = (rows: typeof after) =>
      rows.filter(row => row.table !== 'workplace').sort((a, b) => a.rowId.localeCompare(b.rowId));
    expect(primary(after)).toEqual(primary(h.expected));
    if (published) expect(primary(after)).toEqual(primary(rowsBefore));
    expect(
      (await localKeyHierarchy.exportWorkplaceKeys(result.identity, h.workplaceId)).keyId,
    ).toBe(h.keyId);
    // A further reconstruction uses verified Device access without the recovery credential.
    await expect(h.reopen().restoreSelectedBackup({ archive: h.archive })).resolves.toMatchObject({
      identity: result.identity,
      manifestHash: h.receipt,
    });
  },
);

it('preserves published books and surfaces a derived-balance read failure as a warning', async () => {
  const h = await fixture();
  const read = jest
    .spyOn(transactionRawRebuildQueries, 'getRebuildDataRaw')
    .mockRejectedValueOnce(new Error('derived read unavailable'));
  const result = await h.workflow.restoreSelectedBackup(h.input);
  expect(result.warnings).toEqual(['Post-restore running-balance rebuild failed']);
  expect(result.manifestHash).toBe(h.receipt);
  expect(await h.dependencies.pending.load()).toBeNull();
  const before = await rowSource.readWorkplaceRows(h.workplaceId);
  read.mockRestore();
  await expect(h.reopen().restoreSelectedBackup({ archive: h.archive })).resolves.toMatchObject({
    warnings: [],
    manifestHash: h.receipt,
  });
  expect(await rowSource.readWorkplaceRows(h.workplaceId)).toEqual(before);
});

it('rejects a real primary-ID collision after recovery without publishing partial books', async () => {
  const h = await fixture();
  const other = 'unrelated-workplace' as WorkplaceId;
  await workplaceRepository.create({
    id: other,
    name: 'Unrelated books',
    icon: Icon.Wallet,
    defaultCurrencyCode: 'USD',
  });
  const sourceAccount = h.expected.find(row => row.table === 'accounts')!;
  const collision = await accountWriteRepository.create({
    id: sourceAccount.rowId as AccountId,
    workplaceId: other,
    name: 'Keep this account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  });
  const original = { ...collision._raw };
  for (const workflow of [h.workflow, h.reopen()]) {
    await expect(workflow.restoreSelectedBackup(h.input)).rejects.toThrow(
      'Imported identity collision',
    );
    expect(await h.dependencies.pending.load()).toBe('recovery-device');
    expect(await h.dependencies.session.loadSession()).toBeNull();
    expect(await workplaceRepository.find(h.workplaceId)).toBeUndefined();
    expect(await h.state.read(workplaceScope('alice', h.workplaceId))).toBeNull();
    expect(
      ((await h.state.read(userScope('alice', 'recovery-device'))) as LocalUserKeys)
        .userKeyFingerprint,
    ).toBe(h.input.credential.identityKeyId);
    expect((await database.get<Account>('accounts').find(collision.id))._raw).toEqual(original);
    expect(await database.get('accounts').query().fetchCount()).toBe(1);
    expect(await database.get('journals').query().fetchCount()).toBe(0);
    expect(await database.get('transactions').query().fetchCount()).toBe(0);
    expect(h.target.deviceTags.size).toBe(1);
  }
  expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
});
