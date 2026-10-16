import vectors from '../../../../modules/expo-key-crypto/tests/fixtures/row-vectors.json';
import { keyOperationsFromTransport, type NativeKeyReference } from '../nativeKeyApi';
import type { EncryptRow } from '@/src/services/sync/rowCrypto';
import type { RowEnvelopeJson } from '@/src/services/sync/codec/envelopeJson';
import type { RowTable } from '@/src/services/sync/codec/rowHeader';

jest.mock('@/src/services/backup/cryptoProvider', () => ({
  cryptoProvider: {
    digest: async (bytes: Uint8Array) =>
      new Uint8Array(jest.requireActual('node:crypto').createHash('sha256').update(bytes).digest()),
  },
}));

const workplaceKey: NativeKeyReference = {
  format: 'full-frills-native-key-reference',
  formatVersion: 1,
  kind: 'workplace',
  keyId: vectors.tables[0].keyId,
  handle: 'a'.repeat(64),
};
const manifestKey: NativeKeyReference = {
  ...workplaceKey,
  kind: 'user',
  publicKey: vectors.manifest.publicKeyHex,
  keyId: `sha256:${'b'.repeat(64)}`,
};
const source = vectors.tables[0];
const row: EncryptRow = {
  table: source.table as RowTable,
  rowId: source.rowId,
  updatedAt: source.updatedAt,
  deleted: source.deleted,
  schemaVersion: 1,
  dictId: 'accounts/v1',
  plaintext: '{}',
};
const envelope = {
  format: 'full-frills-encrypted-row' as const,
  formatVersion: 1 as const,
  enc: 'shortkey1+zstd' as const,
  workplaceId: source.workplaceId,
  table: source.table as RowTable,
  rowId: source.rowId,
  updatedAt: source.updatedAt,
  deleted: source.deleted,
  keyId: source.keyId,
  salt: source.salt,
  ciphertextBase64: source.ciphertextBase64,
};
const wireEnvelope: RowEnvelopeJson = {
  format: envelope.format,
  formatVersion: 1,
  enc: envelope.enc,
  workplaceId: envelope.workplaceId,
  table: envelope.table,
  rowId: envelope.rowId,
  updatedAt: envelope.updatedAt,
  deleted: envelope.deleted,
  keyId: envelope.keyId,
  salt: envelope.salt,
  ciphertext: envelope.ciphertextBase64,
};

describe('native row operation boundary', () => {
  it('checks encrypted headers against the submitted rows before returning them', async () => {
    const call = jest.fn(async () => ({ envelopes: [wireEnvelope] }));
    const operations = keyOperationsFromTransport(call);
    const [result] = await operations.encryptRows(workplaceKey, source.workplaceId, source.keyId, [
      row,
    ]);
    expect(result.ciphertext).toBe(source.ciphertextBase64);
    expect(call).toHaveBeenCalledWith(
      'encryptRows',
      expect.objectContaining({ key: workplaceKey }),
    );

    const bad = keyOperationsFromTransport(async () => ({
      envelopes: [{ ...wireEnvelope, table: 'journals' }],
    }));
    await expect(
      bad.encryptRows(workplaceKey, source.workplaceId, source.keyId, [row]),
    ).rejects.toThrow(/scope/);
  });

  it('rejects oversized batches before crossing the native bridge', async () => {
    const call = jest.fn();
    const operations = keyOperationsFromTransport(call);
    await expect(
      operations.encryptRows(workplaceKey, source.workplaceId, source.keyId, Array(501).fill(row)),
    ).rejects.toThrow(/batch count/);
    await expect(
      operations.decryptRows(workplaceKey, source.workplaceId, Array(501).fill(wireEnvelope)),
    ).rejects.toThrow(/batch count/);
    expect(call).not.toHaveBeenCalled();
  });

  it('keeps per-row unreadable-dictionary errors explicit and binds rows to their request', async () => {
    const operations = keyOperationsFromTransport(async () => ({
      rows: [
        { ok: false, rowId: source.rowId, table: source.table, error: 'FFB_ROW_UNKNOWN_DICT' },
      ],
    }));
    await expect(
      operations.decryptRows(workplaceKey, source.workplaceId, [wireEnvelope]),
    ).resolves.toEqual([
      { ok: false, rowId: source.rowId, table: source.table, error: 'FFB_ROW_UNKNOWN_DICT' },
    ]);
    const swapped = keyOperationsFromTransport(async () => ({
      rows: [
        {
          ok: true,
          rowId: 'other',
          table: source.table,
          schemaVersion: 1,
          dictId: 'accounts/v1',
          plaintext: '{}',
        },
      ],
    }));
    await expect(
      swapped.decryptRows(workplaceKey, source.workplaceId, [wireEnvelope]),
    ).rejects.toThrow(/scope/);
  });

  it('signs only the canonical manifest fields and accepts lowercase Ed25519 output', async () => {
    const call = jest.fn(async (_operation: string, _request: unknown) => ({
      signature: vectors.manifest.signatureHex,
    }));
    const operations = keyOperationsFromTransport(call);
    const fields = {
      formatVersion: vectors.manifest.formatVersion,
      workplaceId: vectors.manifest.workplaceId,
      keyId: vectors.manifest.keyId,
      id: vectors.manifest.id,
      seq: vectors.manifest.seq,
      prevHash: Uint8Array.from(Buffer.from(vectors.manifest.prevHash, 'hex')),
      authorUserId: vectors.manifest.authorUserId,
      authorDeviceId: vectors.manifest.authorDeviceId,
      rowCount: vectors.manifest.rowCount,
      root: Uint8Array.from(Buffer.from(vectors.manifest.root, 'hex')),
      createdAt: vectors.manifest.createdAt,
    };
    await expect(operations.signRowManifest(manifestKey, fields)).resolves.toBe(
      vectors.manifest.signatureHex,
    );
    expect(call.mock.calls[0][0]).toBe('signRowManifest');
  });
});
