import vectors from '../../../../modules/expo-key-crypto/tests/fixtures/row-vectors.json';
import { keyOperationsFromTransport, type NativeKeyReference } from '../nativeKeyApi';
import type { EncryptRow } from '@/src/services/crypto/protocol/rowCrypto';
import type { RowEnvelopeJson } from '@/src/services/crypto/protocol/envelopeJson';
import type { RowTable } from '@/src/services/sync/rowTables';
import {
  MAX_ROW_BATCH_BYTES,
  MAX_ROW_CIPHERTEXT_BYTES,
} from '@/src/services/crypto/protocol/rowCrypto';

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
  compression: 'gzip' as const,
  plaintext: '{}',
};
const envelope = {
  format: 'full-frills-encrypted-row' as const,
  formatVersion: 1 as const,
  enc: 'shortkey1' as const,
  compression: 'gzip' as const,
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
  compression: envelope.compression,
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
  it('counts decoded ciphertext bytes for both row and batch limits', async () => {
    const ciphertext = Buffer.alloc(60 * 1024, 1).toString('base64');
    // Encoded text exceeds both old checks, while decoded bytes stay within both limits.
    const envelopes = Array.from({ length: 60 }, (_, index) => ({
      ...wireEnvelope,
      rowId: `row-${index}`,
      ciphertext,
    }));
    const call = jest.fn(async () => ({
      rows: envelopes.map(value => ({
        ok: true,
        rowId: value.rowId,
        table: value.table,
        schemaVersion: 35,
        compression: 'gzip' as const,
        plaintext: '{}',
      })),
    }));
    const operations = keyOperationsFromTransport(call);

    await expect(
      operations.decryptRows(workplaceKey, source.workplaceId, envelopes),
    ).resolves.toHaveLength(60);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('resubmits the remainder when native returns a decrypted prefix', async () => {
    const envelopes = ['a', 'b', 'c'].map(rowId => ({ ...wireEnvelope, rowId }));
    const reply = (batch: RowEnvelopeJson[]) =>
      batch.map(value => ({
        ok: true,
        rowId: value.rowId,
        table: value.table,
        schemaVersion: 35,
        compression: 'gzip' as const,
        plaintext: '{}',
      }));
    const call = jest.fn(async (_operation: string, request: unknown) => {
      const batch = (request as { envelopes: RowEnvelopeJson[] }).envelopes;
      return { rows: reply(batch.length === 3 ? batch.slice(0, 2) : batch) };
    });
    const operations = keyOperationsFromTransport(call);

    const rows = await operations.decryptRows(workplaceKey, source.workplaceId, envelopes);

    expect(rows.map(row => row.rowId)).toEqual(['a', 'b', 'c']);
    expect(
      call.mock.calls.map(([, request]) =>
        (request as { envelopes: RowEnvelopeJson[] }).envelopes.map(value => value.rowId),
      ),
    ).toEqual([['a', 'b', 'c'], ['c']]);
  });

  it('rejects a native reply that makes no progress', async () => {
    const operations = keyOperationsFromTransport(jest.fn(async () => ({ rows: [] })));
    await expect(
      operations.decryptRows(workplaceKey, source.workplaceId, [wireEnvelope]),
    ).rejects.toThrow('Native row count mismatch');
  });

  it('rejects ciphertext beyond the decoded row and batch limits before calling native', async () => {
    const call = jest.fn();
    const operations = keyOperationsFromTransport(call);
    await expect(
      operations.decryptRows(workplaceKey, source.workplaceId, [
        {
          ...wireEnvelope,
          ciphertext: Buffer.alloc(MAX_ROW_CIPHERTEXT_BYTES + 1).toString('base64'),
        },
      ]),
    ).rejects.toThrow('FFB_ROW_TOO_LARGE: row ciphertext');
    const size = 64 * 1024;
    await expect(
      operations.decryptRows(
        workplaceKey,
        source.workplaceId,
        Array.from({ length: Math.floor(MAX_ROW_BATCH_BYTES / size) + 1 }, (_, index) => ({
          ...wireEnvelope,
          rowId: `row-${index}`,
          ciphertext: Buffer.alloc(size).toString('base64'),
        })),
      ),
    ).rejects.toThrow('FFB_ROW_TOO_LARGE: batch ciphertext');
    expect(call).not.toHaveBeenCalled();
  });
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

  it('keeps per-row unsupported-compression errors explicit and binds rows to their request', async () => {
    const operations = keyOperationsFromTransport(async () => ({
      rows: [
        {
          ok: false,
          rowId: source.rowId,
          table: source.table,
          error: 'FFB_ROW_UNSUPPORTED_COMPRESSION',
        },
      ],
    }));
    await expect(
      operations.decryptRows(workplaceKey, source.workplaceId, [wireEnvelope]),
    ).resolves.toEqual([
      {
        ok: false,
        rowId: source.rowId,
        table: source.table,
        error: 'FFB_ROW_UNSUPPORTED_COMPRESSION',
      },
    ]);
    const swapped = keyOperationsFromTransport(async () => ({
      rows: [
        {
          ok: true,
          rowId: 'other',
          table: source.table,
          schemaVersion: 1,
          compression: 'gzip' as const,
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

it('bounds encrypted bridge results before decoding ciphertext', async () => {
  const operations = keyOperationsFromTransport(async () => ({
    envelopes: [{ ...wireEnvelope, ciphertext: 'A'.repeat(100000) }],
  }));
  await expect(
    operations.encryptRows(workplaceKey, source.workplaceId, source.keyId, [row]),
  ).rejects.toThrow(/TOO_LARGE/);
});
