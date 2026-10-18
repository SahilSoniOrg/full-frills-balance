import { asWorkplaceId } from '@/src/types/ids';
import { generator } from '@/src/data/database/idGenerator';
import { syncStateRepository } from '@/src/data/repositories/SyncStateRepository';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import type { KeyAccessIdentity, WorkplaceKeys } from '@/src/services/backup/keyHierarchyRecords';
import { rowSource, type RowSourceRecord } from '../rowSource';
import { buildBackupCommit, buildCommit } from '../buildCommit';
import { ROW_ENCODING, ROW_FORMAT } from '@/src/services/crypto/protocol/rowHeader';
import { serializeRowEnvelope } from '@/src/services/crypto/protocol/envelopeJson';
import type { EncryptRow } from '@/src/services/crypto/protocol/rowCrypto';

jest.mock('@/src/data/database/idGenerator', () => ({ generator: jest.fn() }));
jest.mock('@/src/data/repositories/SyncStateRepository', () => ({
  syncStateRepository: {
    inWriter: jest.fn(),
    readIndexInWriter: jest.fn(),
    readCheckpoint: jest.fn(),
    replaceIndexInWriter: jest.fn(),
    writeCheckpointInWriter: jest.fn(),
  },
}));
jest.mock('@/src/services/backup/localKeyHierarchy', () => ({
  localKeyHierarchy: {
    exportWorkplaceKeys: jest.fn(),
    encryptRows: jest.fn(),
    signRowManifest: jest.fn(),
  },
}));
jest.mock('../rowSource', () => ({
  rowSource: { readWorkplaceRowsInWriter: jest.fn() },
}));
jest.mock('@/src/services/backup/cryptoProvider', () => ({
  cryptoProvider: {
    digest: async (bytes: Uint8Array) =>
      new Uint8Array(jest.requireActual('node:crypto').createHash('sha256').update(bytes).digest()),
  },
}));

const workplaceId = asWorkplaceId('workplace-1');
const identity: KeyAccessIdentity = {
  userId: 'user-1',
  registeredDeviceId: 'device-1',
  userKeyFingerprint: 'a'.repeat(64),
};
const workplaceKeys = {
  keyId: 'key-1',
} as Awaited<ReturnType<typeof localKeyHierarchy.exportWorkplaceKeys>>;
const workplaceRow: RowSourceRecord = {
  table: 'workplace',
  rowId: workplaceId,
  updatedAt: 10,
  deleted: false,
  content: {
    name: 'Home',
    icon: 'briefcase',
    defaultCurrencyCode: 'USD',
    safeToSpendDays: 30,
    currencyPrecisions: { USD: 2 },
  },
};
const accountRow: RowSourceRecord = {
  table: 'accounts',
  rowId: 'account-1',
  updatedAt: 11,
  deleted: false,
  content: {
    name: 'Cash',
    accountType: 'ASSET',
    currencyCode: 'USD',
    color: '#123456',
    createdAt: 1,
    updatedAt: 11,
  },
};

function makeEnvelope(workplace: string, row: EncryptRow) {
  return serializeRowEnvelope({
    format: ROW_FORMAT,
    formatVersion: 1,
    enc: ROW_ENCODING,
    compression: row.compression,
    workplaceId: workplace,
    table: row.table,
    rowId: row.rowId,
    updatedAt: row.updatedAt,
    deleted: row.deleted,
    keyId: 'key-1',
    salt: new Uint8Array(16),
    ciphertext: Uint8Array.of(0xa5, row.deleted ? 1 : 0),
  });
}

const mocked = {
  write: syncStateRepository.inWriter as jest.Mock,
  readRows: rowSource.readWorkplaceRowsInWriter as jest.Mock,
  readIndex: syncStateRepository.readIndexInWriter as jest.Mock,
  readCheckpoint: syncStateRepository.readCheckpoint as jest.Mock,
  replaceIndex: syncStateRepository.replaceIndexInWriter as jest.Mock,
  writeCheckpoint: syncStateRepository.writeCheckpointInWriter as jest.Mock,
  exportKeys: localKeyHierarchy.exportWorkplaceKeys as jest.Mock,
  encryptRows: localKeyHierarchy.encryptRows as jest.Mock,
  signManifest: localKeyHierarchy.signRowManifest as jest.Mock,
  generateId: generator as jest.Mock,
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.write.mockImplementation(async (work: () => Promise<unknown>) => work());
  mocked.exportKeys.mockResolvedValue(workplaceKeys as WorkplaceKeys);
  mocked.encryptRows.mockImplementation(
    async (_access: KeyAccessIdentity, scopedWorkplace: string, rows: readonly EncryptRow[]) =>
      rows.map(row => makeEnvelope(scopedWorkplace, row)),
  );
  mocked.signManifest.mockResolvedValue('signature');
  mocked.readCheckpoint.mockResolvedValue(null);
  mocked.generateId.mockReturnValue('manifest-genesis');
});

describe('buildCommit', () => {
  it('encrypts the complete current state and creates a seq-zero genesis manifest', async () => {
    mocked.readRows.mockResolvedValue([workplaceRow, accountRow]);
    mocked.readIndex.mockResolvedValue([]);

    const commit = await buildCommit(identity, workplaceId);

    expect(mocked.write).toHaveBeenCalledTimes(1);
    expect(mocked.readRows).toHaveBeenCalledWith(workplaceId);
    expect(mocked.readIndex).toHaveBeenCalledWith(workplaceId);
    expect(mocked.readRows.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocked.write.mock.invocationCallOrder[0],
    );
    expect(mocked.readIndex.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocked.write.mock.invocationCallOrder[0],
    );
    expect(mocked.encryptRows).toHaveBeenCalledTimes(1);
    expect(mocked.encryptRows.mock.calls[0][2]).toHaveLength(2);
    expect(commit.envelopes).toHaveLength(2);
    expect(commit.manifest).toMatchObject({
      seq: 0,
      prevHash: '0'.repeat(64),
      rowCount: 2,
      signature: 'signature',
    });
    expect(commit.nextIndex).toHaveLength(2);
    expect(mocked.replaceIndex).not.toHaveBeenCalled();
    expect(mocked.writeCheckpoint).not.toHaveBeenCalled();
  });

  it('emits no envelopes for an unchanged second build and reuses its authenticated leaf hashes', async () => {
    mocked.readRows.mockResolvedValue([workplaceRow, accountRow]);
    mocked.readIndex.mockResolvedValueOnce([]);
    mocked.readCheckpoint.mockResolvedValueOnce(null);
    mocked.generateId.mockReturnValueOnce('manifest-genesis').mockReturnValueOnce('manifest-next');

    const first = await buildCommit(identity, workplaceId);
    const checkpoint = {
      seq: first.manifest.seq,
      manifestHash: first.manifestHash,
      authorDeviceId: identity.registeredDeviceId,
    };
    mocked.readIndex.mockResolvedValueOnce([...first.nextIndex]);
    mocked.readCheckpoint.mockResolvedValueOnce(checkpoint);

    const second = await buildCommit(identity, workplaceId);

    expect(second.manifest.seq).toBe(1);
    expect(second.manifest.prevHash).toBe(first.manifestHash);
    expect(second.envelopes).toEqual([]);
    expect(mocked.encryptRows).toHaveBeenCalledTimes(1);
    expect(second.nextIndex.map(row => row.leafHash)).toEqual(
      first.nextIndex.map(row => row.leafHash),
    );
    expect(second.nextIndex.map(row => row.seq)).toEqual(first.nextIndex.map(row => row.seq));
  });

  it('proposes a tombstone for an indexed hard-deleted row without persisting the proposed index', async () => {
    mocked.readRows.mockResolvedValueOnce([workplaceRow, accountRow]);
    mocked.readIndex.mockResolvedValueOnce([]);
    const first = await buildCommit(identity, workplaceId);

    mocked.readRows.mockResolvedValueOnce([workplaceRow]);
    mocked.readIndex.mockResolvedValueOnce([...first.nextIndex]);
    mocked.readCheckpoint.mockResolvedValueOnce({
      seq: first.manifest.seq,
      manifestHash: first.manifestHash,
      authorDeviceId: identity.registeredDeviceId,
    });
    mocked.generateId.mockReturnValueOnce('manifest-after-delete');

    const deletion = await buildCommit(identity, workplaceId);

    expect(deletion.envelopes).toHaveLength(1);
    expect(deletion.envelopes[0]).toMatchObject({
      table: 'accounts',
      rowId: 'account-1',
      deleted: true,
    });
    expect(deletion.nextIndex).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'accounts',
          rowId: 'account-1',
          contentHash: expect.stringMatching(/^tombstone:/),
          seq: deletion.manifest.seq,
        }),
      ]),
    );
    expect(deletion.nextIndex).toHaveLength(2);
    expect(mocked.replaceIndex).not.toHaveBeenCalled();
    expect(mocked.writeCheckpoint).not.toHaveBeenCalled();
  });

  it('builds every offline backup as a fresh independent genesis without reading sync state', async () => {
    mocked.readRows.mockResolvedValue([workplaceRow, accountRow]);
    mocked.readIndex.mockRejectedValue(new Error('backup must not read sync index'));
    mocked.readCheckpoint.mockRejectedValue(new Error('backup must not read sync checkpoint'));
    mocked.generateId.mockReturnValueOnce('backup-one').mockReturnValueOnce('backup-two');

    const first = await buildBackupCommit(identity, workplaceId);
    const second = await buildBackupCommit(identity, workplaceId);

    expect(first.manifest).toMatchObject({ seq: 0, prevHash: '0'.repeat(64), rowCount: 2 });
    expect(second.manifest).toMatchObject({ seq: 0, prevHash: '0'.repeat(64), rowCount: 2 });
    expect(first.envelopes).toHaveLength(2);
    expect(second.envelopes).toHaveLength(2);
    expect(mocked.readIndex).not.toHaveBeenCalled();
    expect(mocked.readCheckpoint).not.toHaveBeenCalled();
    expect(mocked.replaceIndex).not.toHaveBeenCalled();
    expect(mocked.writeCheckpoint).not.toHaveBeenCalled();
    expect(mocked.encryptRows).toHaveBeenCalledTimes(2);
  });
});

it.each([buildBackupCommit, buildCommit])(
  'rejects nonfinancial prepared records before encryption',
  async build => {
    mocked.readIndex.mockResolvedValue([]);
    mocked.readCheckpoint.mockResolvedValue(null);
    mocked.readRows.mockResolvedValue([{ ...accountRow, table: 'weather.observation' }]);
    await expect(build(identity, workplaceId)).rejects.toThrow(/Unknown row table/);
    expect(mocked.encryptRows).not.toHaveBeenCalled();
  },
);
