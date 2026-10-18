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
import { EncryptedRestoreCompletion } from '@/src/services/backup/encryptedRestoreCompletion';
import { restoreCompletionRepository } from '@/src/data/repositories/RestoreCompletionRepository';
import { preferences } from '@/src/services/preferences';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
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
  jest
    .spyOn(localKeyHierarchy, 'commitRestoreDraft')
    .mockImplementation((...args) => hierarchy.commitRestoreDraft(...args));
  const archive = await createEncryptedBackupZip(identity, workplaceId);
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
    clear: async () => undefined,
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
  const complete = () =>
    new EncryptedRestoreCompletion({
      repository: restoreCompletionRepository,
      hierarchy: localKeyHierarchy,
      session: dependencies.session,
      pendingDevice: dependencies.pending,
      assertAccess: () => undefined,
      updatePreferences: (id, safeToSpendDays) =>
        preferences.workplace.update(id, { safeToSpendDays }),
      rebuildBalances: async id =>
        rebuildAllAccountBalancesAfterImport(id, await accountQueryRepository.findAll(id), 2),
    }).resume(() => undefined);
  const reopen = () => {
    hierarchy = new LocalKeyHierarchy(state, () => undefined, target.crypto);
    return new EncryptedRestoreWorkflow(dependencies);
  };
  return {
    source,
    target,
    state,
    archive,
    expected,
    receipt,
    workplaceId,
    dependencies,
    complete,
    reopen,
    workflow: reopen(),
    input: { archive, credential: userCredential },
    keyId: parsed.workplaceKeys.keyId,
  };
}

it.each(['publication', 'durability', 'keys', 'session', 'acknowledgement'] as const)(
  'resumes a real restore after %s fails without replacing identity or financial records',
  async boundary => {
    const h = await fixture();
    const injected = new Error(`injected:${boundary}`);
    const fail = async (): Promise<never> => {
      throw injected;
    };
    if (boundary === 'publication') jest.spyOn(database, 'batch').mockImplementationOnce(fail);
    if (boundary === 'durability')
      jest.spyOn(persistence, 'flushDatabasePersistence').mockImplementationOnce(fail);
    if (boundary === 'publication' || boundary === 'durability') {
      await expect(h.workflow.restoreSelectedBackup(h.input)).rejects.toBe(injected);
    } else {
      await expect(h.workflow.restoreSelectedBackup(h.input)).resolves.toMatchObject({
        status: 'completion-pending',
      });
      if (boundary === 'keys')
        jest.mocked(localKeyHierarchy.installWorkplaceKeys).mockImplementationOnce(fail);
      if (boundary === 'session')
        jest.spyOn(h.dependencies.session, 'saveSession').mockImplementationOnce(fail);
      if (boundary === 'acknowledgement')
        jest.spyOn(restoreCompletionRepository, 'clear').mockImplementationOnce(fail);
      await expect(h.complete()).rejects.toBe(injected);
    }
    const user = (await h.state.read(userScope('alice', 'recovery-device'))) as LocalUserKeys;
    const tags = [...h.target.deviceTags];
    expect(tags).toHaveLength(1);
    const published = await workplaceRepository.find(h.workplaceId);
    expect(published?.rowRestoreManifestHash ?? null).toBe(
      boundary === 'publication' ? null : h.receipt,
    );
    if (boundary === 'publication') {
      expect(await database.get('accounts').query().fetchCount()).toBe(0);
      await h.reopen().restoreSelectedBackup(h.input);
    } else {
      expect(published!.rowRestoreCompletionJson).not.toBeNull();
      expect(published!.rowRestoreCompletionJson).not.toContain(h.input.credential.handle);
    }
    const before = await rowSource.readWorkplaceRows(h.workplaceId);
    // Reconstruct the key owner, then finish using ONLY the persisted DB handoff.
    h.reopen();
    await h.complete();
    expect((await workplaceRepository.find(h.workplaceId))!.rowRestoreCompletionJson).toBeNull();
    expect((await workplaceRepository.find(h.workplaceId))!.rowRestoreManifestHash).toBe(h.receipt);
    expect([...h.target.deviceTags]).toEqual(tags);
    expect(await h.state.read(userScope('alice', 'recovery-device'))).toEqual(user);
    expect(await h.dependencies.pending.load()).toBeNull();
    expect(await h.dependencies.session.loadSession()).toMatchObject({
      userId: 'alice',
      deviceId: 'recovery-device',
    });
    const primary = (rows: typeof before) =>
      rows.filter(row => row.table !== 'workplace').sort((a, b) => a.rowId.localeCompare(b.rowId));
    expect(primary(await rowSource.readWorkplaceRows(h.workplaceId))).toEqual(primary(before));
    expect(primary(before)).toEqual(primary(h.expected));
    await expect(h.reopen().restoreSelectedBackup({ archive: h.archive })).resolves.toMatchObject({
      status: 'ready',
      manifestHash: h.receipt,
    });
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  },
);

it('keeps published books gated until balance rebuilding succeeds', async () => {
  const h = await fixture();
  await h.workflow.restoreSelectedBackup(h.input);
  const before = await rowSource.readWorkplaceRows(h.workplaceId);
  const read = jest
    .spyOn(transactionRawRebuildQueries, 'getRebuildDataRaw')
    .mockRejectedValueOnce(new Error('derived read unavailable'));
  await expect(h.complete()).rejects.toThrow('derived read unavailable');
  expect((await workplaceRepository.find(h.workplaceId))!.rowRestoreCompletionJson).not.toBeNull();
  read.mockRestore();
  h.reopen();
  await h.complete();
  expect((await workplaceRepository.find(h.workplaceId))!.rowRestoreCompletionJson).toBeNull();
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
