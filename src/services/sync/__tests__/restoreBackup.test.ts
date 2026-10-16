import { restoreBackup } from '../restoreBackup';
import { parseBackupZip } from '../backupFile';
import { verifyRowManifest } from '../manifestVerify';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { preferences } from '@/src/services/preferences';
import { computeMerkleRootFromLeaves, hashRowLeaf } from '../codec/merkle';
import { hashManifest } from '../codec/manifestBytes';
import { decodeCanonicalRow } from '../shortKeys';
import { rowImportData, validateWorkplaceRows } from '../rowSource';
import { userIdentityFingerprint } from '@/src/services/backup/userIdentity';
import { parseRowEnvelope } from '../rowEnvelope';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { setKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';

jest.mock('../backupFile', () => ({ parseBackupZip: jest.fn() }));
jest.mock('../manifestVerify', () => ({ verifyRowManifest: jest.fn() }));
jest.mock('@/src/services/backup/localKeyHierarchy', () => ({
  localKeyHierarchy: {
    validateRecoveryCredential: jest.fn(),
    recoverUserDevice: jest.fn(),
    decryptRows: jest.fn(),
    describeSetup: jest.fn(),
    preflightWorkplaceRestore: jest.fn(),
    installWorkplaceKeys: jest.fn(),
    exportWorkplaceKeys: jest.fn(),
  },
}));
jest.mock('@/src/data/repositories/ImportRepository', () => ({
  importRepository: { batchInsertRowRestore: jest.fn() },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getPrecision: jest.fn() },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: { workplace: { update: jest.fn() } },
}));
jest.mock('../codec/merkle', () => ({
  computeMerkleRootFromLeaves: jest.fn(),
  hashRowLeaf: jest.fn(),
}));
jest.mock('../codec/manifestBytes', () => ({ hashManifest: jest.fn() }));
jest.mock('../shortKeys', () => ({ decodeCanonicalRow: jest.fn() }));
jest.mock('../rowSource', () => ({
  rowImportData: jest.fn(),
  validateWorkplaceRows: jest.fn(),
}));
jest.mock('@/src/services/import/validateImportedData', () => ({
  validateImportedData: jest.fn(),
}));
jest.mock('@/src/services/backup/userIdentity', () => ({
  userIdentityFingerprint: jest.fn(),
}));
jest.mock('@/src/services/backup/keyHierarchyRecords', () => ({
  parseExportedUserRecoveryPackage: jest.fn(value => value),
}));
jest.mock('../rowEnvelope', () => ({ parseRowEnvelope: jest.fn() }));
jest.mock('@/src/services/import/importAccountBalanceRebuild', () => ({
  rebuildAllAccountBalancesAfterImport: jest.fn(),
}));
jest.mock('@/src/data/repositories/account', () => ({
  accountQueryRepository: { findAll: jest.fn() },
}));

const identity = {
  userId: 'user-1',
  registeredDeviceId: 'device-2',
  userKeyFingerprint: `sha256:${'a'.repeat(64)}`,
};
const workplaceId = 'workplace-1';
const content = {
  name: 'Restored',
  icon: 'briefcase',
  defaultCurrencyCode: 'USD',
  safeToSpendDays: 60,
  currencyPrecisions: { USD: 2 },
};
const rows = [
  {
    table: 'workplace',
    rowId: workplaceId,
    updatedAt: 1,
    deleted: false,
    content,
  },
];
const workplaceKeys = {
  format: 'full-frills-workplace-keys',
  formatVersion: 1,
  userId: identity.userId,
  workplaceId,
  userKeyFingerprint: identity.userKeyFingerprint,
  keyId: `sha256:${'b'.repeat(64)}`,
  memberEnvelope: {},
  recoveryPublicKey: 'public',
  recoveryEnvelope: {},
  recoveryConfirmed: true,
};
const userRecoveryPackage = {
  format: 'full-frills-user-recovery',
  formatVersion: 1,
  userId: identity.userId,
  publicIdentity: { userId: identity.userId },
  userKeyFingerprint: identity.userKeyFingerprint,
  recoveryPublicKey: 'public',
  recoveryEnvelope: {},
};
const manifest = {
  formatVersion: 1,
  workplaceId,
  keyId: workplaceKeys.keyId,
  id: 'manifest-1',
  seq: 0,
  prevHash: '0'.repeat(64),
  authorUserId: identity.userId,
  authorDeviceId: 'device-1',
  rowCount: 1,
  root: '01',
  createdAt: 1,
  signature: 'signature',
};
const envelope = {
  table: 'workplace',
  rowId: workplaceId,
  workplaceId,
  keyId: workplaceKeys.keyId,
  updatedAt: 1,
  deleted: false,
  schemaVersion: 35,
  dictId: 'workplace/v1',
  salt: 'salt',
  ciphertext: 'ciphertext',
};
const backup = { manifest, envelopes: [envelope], workplaceKeys, userRecoveryPackage };

describe('restoreBackup', () => {
  afterEach(() => setKeyAccessAllowed(false));

  beforeEach(() => {
    jest.clearAllMocks();
    setKeyAccessAllowed(true);
    jest.mocked(parseBackupZip).mockReturnValue(backup as never);
    jest.mocked(userIdentityFingerprint).mockResolvedValue(identity.userKeyFingerprint);
    jest.mocked(verifyRowManifest).mockResolvedValue({
      fields: {
        workplaceId,
        keyId: workplaceKeys.keyId,
        authorUserId: identity.userId,
        rowCount: 1,
        root: Uint8Array.of(1),
      },
    } as never);
    jest.mocked(localKeyHierarchy.validateRecoveryCredential).mockResolvedValue(undefined);
    jest.mocked(localKeyHierarchy.recoverUserDevice).mockResolvedValue(identity);
    jest.mocked(localKeyHierarchy.describeSetup).mockResolvedValue({ user: 'not-started' });
    jest.mocked(localKeyHierarchy.decryptRows).mockResolvedValue([
      {
        ok: true,
        table: 'workplace',
        rowId: workplaceId,
        schemaVersion: 35,
        dictId: 'workplace/v1',
        plaintext: '{}',
      },
    ] as never);
    jest.mocked(localKeyHierarchy.preflightWorkplaceRestore).mockResolvedValue('installable');
    jest.mocked(parseRowEnvelope).mockReturnValue({
      table: 'workplace',
      rowId: workplaceId,
      workplaceId,
      keyId: workplaceKeys.keyId,
      updatedAt: 1,
      deleted: false,
      schemaVersion: 35,
      dictId: 'workplace/v1',
      salt: new Uint8Array(16),
      ciphertext: new Uint8Array(16),
    } as never);
    jest.mocked(decodeCanonicalRow).mockReturnValue(content);
    jest.mocked(hashRowLeaf).mockResolvedValue(Uint8Array.of(9));
    jest.mocked(computeMerkleRootFromLeaves).mockResolvedValue(Uint8Array.of(1));
    jest.mocked(hashManifest).mockResolvedValue(Uint8Array.of(3));
    jest.mocked(validateWorkplaceRows).mockReturnValue(rows as never);
    jest.mocked(rowImportData).mockReturnValue({
      accounts: [],
      journals: [],
      transactions: [],
      auditLogs: [],
    });
    jest.mocked(currencyReadService.getPrecision).mockResolvedValue(2);
    jest
      .mocked(importRepository.batchInsertRowRestore)
      .mockResolvedValue({ id: workplaceId } as never);
    jest.mocked(accountQueryRepository.findAll).mockResolvedValue([]);
  });

  it('verifies before creating a recovery identity, publishes before installing keys, then rebuilds', async () => {
    const credential = {
      format: 'full-frills-recovery-handle',
      formatVersion: 1,
      purpose: 'user-recovery',
      identityId: identity.userId,
      identityKeyId: identity.userKeyFingerprint,
      recoveryKeyId: `sha256:${'c'.repeat(64)}`,
      handle: 'd'.repeat(64),
    };
    const result = await restoreBackup(new Uint8Array([1]), {
      mode: 'recovery',
      credential,
      deviceId: identity.registeredDeviceId,
    });

    expect(jest.mocked(verifyRowManifest).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(localKeyHierarchy.recoverUserDevice).mock.invocationCallOrder[0],
    );
    expect(
      jest.mocked(importRepository.batchInsertRowRestore).mock.invocationCallOrder[0],
    ).toBeLessThan(jest.mocked(localKeyHierarchy.installWorkplaceKeys).mock.invocationCallOrder[0]);
    expect(preferences.workplace.update).toHaveBeenCalledWith(workplaceId, {
      safeToSpendDays: 60,
    });
    expect(rebuildAllAccountBalancesAfterImport).toHaveBeenCalled();
    expect(result.manifestHash).toBe('03');
  });

  it('does not recover or publish when the manifest signature fails', async () => {
    jest.mocked(verifyRowManifest).mockRejectedValue(new Error('bad signature'));
    await expect(
      restoreBackup(new Uint8Array([1]), {
        mode: 'recovery',
        credential: {
          format: 'full-frills-recovery-handle',
          formatVersion: 1,
          purpose: 'user-recovery',
          identityId: identity.userId,
          identityKeyId: identity.userKeyFingerprint,
          recoveryKeyId: `sha256:${'c'.repeat(64)}`,
          handle: 'd'.repeat(64),
        },
        deviceId: identity.registeredDeviceId,
      }),
    ).rejects.toThrow('bad signature');
    expect(localKeyHierarchy.recoverUserDevice).not.toHaveBeenCalled();
    expect(importRepository.batchInsertRowRestore).not.toHaveBeenCalled();
  });

  it('reuses a recovered Device after a failed restore attempt', async () => {
    const credential = {
      format: 'full-frills-recovery-handle',
      formatVersion: 1,
      purpose: 'user-recovery',
      identityId: identity.userId,
      identityKeyId: identity.userKeyFingerprint,
      recoveryKeyId: `sha256:${'c'.repeat(64)}`,
      handle: 'd'.repeat(64),
    };
    jest
      .mocked(localKeyHierarchy.describeSetup)
      .mockResolvedValueOnce({ user: 'not-started' })
      .mockResolvedValueOnce({ user: 'ready', identity });
    jest
      .mocked(computeMerkleRootFromLeaves)
      .mockResolvedValueOnce(Uint8Array.of(2))
      .mockResolvedValueOnce(Uint8Array.of(1));

    const access = {
      mode: 'recovery' as const,
      credential,
      deviceId: identity.registeredDeviceId,
    };
    await expect(restoreBackup(new Uint8Array([1]), access)).rejects.toThrow();
    expect(importRepository.batchInsertRowRestore).not.toHaveBeenCalled();

    await expect(restoreBackup(new Uint8Array([1]), access)).resolves.toMatchObject({
      identity,
    });
    expect(localKeyHierarchy.recoverUserDevice).toHaveBeenCalledTimes(1);
    expect(importRepository.batchInsertRowRestore).toHaveBeenCalledTimes(1);
  });

  it('rejects a Merkle mismatch before database publication', async () => {
    jest.mocked(computeMerkleRootFromLeaves).mockResolvedValue(Uint8Array.of(2));
    await expect(
      restoreBackup(new Uint8Array([1]), { mode: 'existing', identity }),
    ).rejects.toThrow();
    expect(importRepository.batchInsertRowRestore).not.toHaveBeenCalled();
  });

  it('rejects changed local currency precision before database publication', async () => {
    jest.mocked(currencyReadService.getPrecision).mockResolvedValue(0);
    await expect(
      restoreBackup(new Uint8Array([1]), { mode: 'existing', identity }),
    ).rejects.toThrow(/currency precision differs/);
    expect(importRepository.batchInsertRowRestore).not.toHaveBeenCalled();
  });

  it('rejects an installed Workplace key mismatch before database publication', async () => {
    jest
      .mocked(localKeyHierarchy.preflightWorkplaceRestore)
      .mockRejectedValue(new Error('Installed Workplace key does not match the backup'));

    await expect(
      restoreBackup(new Uint8Array([1]), { mode: 'existing', identity }),
    ).rejects.toThrow('Installed Workplace key does not match the backup');

    expect(importRepository.batchInsertRowRestore).not.toHaveBeenCalled();
    expect(localKeyHierarchy.installWorkplaceKeys).not.toHaveBeenCalled();
    expect(preferences.workplace.update).not.toHaveBeenCalled();
  });

  it('reuses an already installed matching Workplace key', async () => {
    jest.mocked(localKeyHierarchy.preflightWorkplaceRestore).mockResolvedValue('installed');

    await restoreBackup(new Uint8Array([1]), { mode: 'existing', identity });

    expect(localKeyHierarchy.installWorkplaceKeys).not.toHaveBeenCalled();
    expect(
      jest.mocked(localKeyHierarchy.preflightWorkplaceRestore).mock.invocationCallOrder[0],
    ).toBeLessThan(jest.mocked(importRepository.batchInsertRowRestore).mock.invocationCallOrder[0]);
  });

  it('rejects an established key identity mismatch before database publication', async () => {
    jest
      .mocked(localKeyHierarchy.preflightWorkplaceRestore)
      .mockRejectedValue(new Error('Established Workplace identity mismatch'));

    await expect(
      restoreBackup(new Uint8Array([1]), { mode: 'existing', identity }),
    ).rejects.toThrow('Established Workplace identity mismatch');

    expect(importRepository.batchInsertRowRestore).not.toHaveBeenCalled();
    expect(localKeyHierarchy.installWorkplaceKeys).not.toHaveBeenCalled();
  });
  it('submits full-count batches and leaves expansion limits to native resumption', async () => {
    const envelopes = Array.from({ length: 100 }, (_, index) => ({
      ...envelope,
      rowId: `row-${index}`,
    }));
    jest.mocked(parseBackupZip).mockReturnValue({ ...backup, envelopes } as never);
    jest.mocked(localKeyHierarchy.decryptRows).mockImplementation(
      async (_id, _workplace, batch) =>
        batch.map(value => ({
          ok: true,
          table: value.table,
          rowId: value.rowId,
          schemaVersion: 35,
          dictId: 'workplace/v1',
          plaintext: '{}',
        })) as never,
    );
    jest.mocked(parseRowEnvelope).mockImplementation(
      value =>
        ({
          ...(value as typeof envelope),
          salt: new Uint8Array(16),
          ciphertext: new Uint8Array(32),
        }) as never,
    );

    await expect(
      restoreBackup(new Uint8Array([1]), { mode: 'existing', identity }),
    ).resolves.toBeDefined();
    expect(
      jest.mocked(localKeyHierarchy.decryptRows).mock.calls.map(call => call[2].length),
    ).toEqual([100]);
  });

  it.each([false, true])(
    'cancels publication if the app locks while hashing (unlock again: %s)',
    async unlockAgain => {
      jest.mocked(hashManifest).mockImplementationOnce(async () => {
        setKeyAccessAllowed(false);
        if (unlockAgain) setKeyAccessAllowed(true);
        return Uint8Array.of(3);
      });

      await expect(
        restoreBackup(new Uint8Array([1]), { mode: 'existing', identity }),
      ).rejects.toMatchObject({ code: 'FFB_KEY_CANCELLED' });
      expect(importRepository.batchInsertRowRestore).not.toHaveBeenCalled();
    },
  );

  it('passes app-lock cancellation into queued database publication', async () => {
    jest
      .mocked(importRepository.batchInsertRowRestore)
      .mockImplementationOnce(async (_workplace, _data, _hash, signal) => {
        expect(signal?.aborted).toBe(false);
        setKeyAccessAllowed(false);
        expect(signal?.aborted).toBe(true);
        throw Object.assign(new Error('Row restore was cancelled'), { name: 'AbortError' });
      });

    await expect(
      restoreBackup(new Uint8Array([1]), { mode: 'existing', identity }),
    ).rejects.toMatchObject({ code: 'FFB_KEY_CANCELLED' });
    expect(localKeyHierarchy.installWorkplaceKeys).not.toHaveBeenCalled();
    expect(preferences.workplace.update).not.toHaveBeenCalled();
  });
});
