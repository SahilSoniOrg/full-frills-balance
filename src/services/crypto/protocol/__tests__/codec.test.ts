import {
  decodeTlv,
  decodeUvarint,
  decodeUtf8,
  encodeTlv,
  encodeUvarint,
  encodeUtf8,
} from '@/src/services/crypto/protocol/tlv';
import {
  decodeInnerPlaintext,
  encodeInnerPlaintext,
  encodeRowHeader,
  encodeRowInfo,
} from '@/src/services/crypto/protocol/rowHeader';
import {
  parseRowEnvelope,
  serializeRowEnvelope,
} from '@/src/services/crypto/protocol/envelopeJson';
import {
  decodeManifestBytes,
  encodeManifestBytes,
  hashManifest,
} from '@/src/services/crypto/protocol/manifestBytes';
import {
  computeMerkleRoot,
  computeMerkleRootFromLeaves,
} from '@/src/services/crypto/protocol/merkle';
import { createHash } from 'node:crypto';
import vectors from '@/modules/expo-key-crypto/tests/fixtures/row-vectors.json';

jest.mock('@/src/services/backup/cryptoProvider', () => ({
  cryptoProvider: {
    digest: async (bytes: Uint8Array) =>
      new Uint8Array(jest.requireActual('node:crypto').createHash('sha256').update(bytes).digest()),
  },
}));

describe('canonical row codec', () => {
  test.each([
    [127, '7f'],
    [128, '8001'],
    [16383, 'ff7f'],
    [16384, '808001'],
  ] as const)('uvarint %i', (value, hex) => {
    expect(Buffer.from(encodeUvarint(value)).toString('hex')).toBe(hex);
    expect(decodeUvarint(Buffer.from(hex, 'hex'))).toEqual({
      value,
      bytesRead: hex.length / 2,
    });
  });

  test.each([
    ['8000', 'Nonminimal'],
    ['8100', 'Nonminimal'],
    ['80808080808080808000', 'overflowing'],
    ['80', 'Truncated'],
  ])('rejects malformed varint %s', (hex, message) => {
    expect(() => decodeUvarint(Buffer.from(hex, 'hex'))).toThrow(message);
  });

  test('rejects noncanonical TLV order, duplicate, missing, unknown, and malformed UTF-8', () => {
    expect(() => decodeTlv(Uint8Array.from([1, 2, 0, 1, 0]), 1, [1, 2])).toThrow(/order/);
    expect(() => decodeTlv(Uint8Array.from([1, 1, 0, 1, 0, 1, 0, 1]), 1, [1])).toThrow(/order/);
    expect(() => decodeTlv(Uint8Array.from([1, 2, 0]), 1, [1])).toThrow(/Unknown/);
    expect(() => decodeTlv(Uint8Array.from([1, 1, 0]), 1, [1, 2])).toThrow(/Missing/);
    expect(() => decodeTlv(Uint8Array.from([1, 1, 1, 0xff]), 1, [1])).not.toThrow();
    expect(() => decodeUtf8(Uint8Array.of(0xff))).toThrow();
    expect(decodeUtf8(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61))).toBe('\ufeffa');
    expect(() => encodeUtf8('\ud800')).toThrow(/surrogate/);
    expect(() => encodeUtf8('é'.repeat(65), 'identifier', true)).toThrow(/128/);
  });

  test('round-trips inner TLV and rejects trailing fields', () => {
    const encoded = encodeInnerPlaintext(4, 'accounts/v1', Uint8Array.of(0, 1, 2));
    expect(decodeInnerPlaintext(encoded)).toEqual({
      schemaVersion: 4,
      dictId: 'accounts/v1',
      body: Uint8Array.of(0, 1, 2),
    });
    expect(() => decodeInnerPlaintext(Uint8Array.from([...encoded, 1]))).toThrow();
  });

  test('matches oracle header, info, Merkle root and manifest bytes', async () => {
    const merkleRows = [];
    for (const row of vectors.tables) {
      const header = encodeRowHeader({
        workplaceId: row.workplaceId,
        table: row.table,
        rowId: row.rowId,
        updatedAt: row.updatedAt,
        deleted: row.deleted,
        keyId: row.keyId,
        salt: Uint8Array.from(Buffer.from(row.salt, 'base64')),
      });
      expect(Buffer.from(header).toString('hex')).toBe(row.aadHex);
      expect(Buffer.from(encodeRowInfo(row.table)).toString('hex')).toBe(row.infoHex);
      merkleRows.push({
        workplaceId: row.workplaceId,
        table: row.table,
        rowId: row.rowId,
        updatedAt: row.updatedAt,
        deleted: row.deleted,
        keyId: row.keyId,
        salt: Uint8Array.from(Buffer.from(row.salt, 'base64')),
        ciphertext: Uint8Array.from(Buffer.from(row.ciphertextBase64, 'base64')),
      });
    }
    const manifest = vectors.manifest;
    const fields = {
      formatVersion: manifest.formatVersion,
      workplaceId: manifest.workplaceId,
      keyId: manifest.keyId,
      id: manifest.id,
      seq: manifest.seq,
      prevHash: Uint8Array.from(Buffer.from(manifest.prevHash, 'hex')),
      authorUserId: manifest.authorUserId,
      authorDeviceId: manifest.authorDeviceId,
      rowCount: manifest.rowCount,
      root: Uint8Array.from(Buffer.from(manifest.root, 'hex')),
      createdAt: manifest.createdAt,
    };
    const bytes = encodeManifestBytes(fields);
    expect(Buffer.from(bytes).toString('hex')).toBe(manifest.signedBytesHex);
    expect(Buffer.from(await hashManifest(fields)).toString('hex')).toBe(manifest.hashHex);
    expect(decodeManifestBytes(bytes)).toEqual(fields);
    expect(
      Buffer.from(await computeMerkleRoot(merkleRows, manifest.rowCount)).toString('hex'),
    ).toBe(manifest.root);
  });

  test.each(Object.values(vectors.merkleCases))(
    'matches RFC 6962 tree for $n leaves',
    async fixture => {
      const leaves = fixture.leavesHex.map((hex, i) => ({
        table: 'accounts' as const,
        rowId: i.toString().padStart(3, '0'),
        hash: new Uint8Array(
          createHash('sha256')
            .update(Buffer.concat([Buffer.from([0]), Buffer.from(hex, 'hex')]))
            .digest(),
        ),
      }));
      expect(
        Buffer.from(await computeMerkleRootFromLeaves(leaves, leaves.length)).toString('hex'),
      ).toBe(fixture.rootHex);
    },
  );

  test('envelope JSON is exact and canonical', () => {
    const original = {
      format: 'full-frills-encrypted-row' as const,
      formatVersion: 1 as const,
      enc: 'shortkey1+zstd' as const,
      workplaceId: 'w',
      table: 'accounts' as const,
      rowId: 'r',
      updatedAt: -1,
      deleted: false,
      keyId: 'k',
      salt: new Uint8Array(16),
      ciphertext: Uint8Array.of(1, 2, 3),
    };
    expect(parseRowEnvelope(serializeRowEnvelope(original))).toEqual(original);
    expect(() => parseRowEnvelope({ ...serializeRowEnvelope(original), extra: true })).toThrow(
      /unknown/,
    );
    expect(() => parseRowEnvelope({ ...serializeRowEnvelope(original), updatedAt: 1.2 })).toThrow(
      /safe integer/,
    );
    expect(() =>
      parseRowEnvelope({
        ...serializeRowEnvelope(original),
        ciphertext: 'AB==',
      }),
    ).toThrow(/base64/);
  });

  test('Merkle rejects count mismatch and duplicate row keys', async () => {
    const base = {
      workplaceId: 'w',
      table: 'accounts' as const,
      rowId: 'same',
      updatedAt: 1,
      deleted: false,
      keyId: 'k',
      salt: new Uint8Array(16),
      ciphertext: Uint8Array.of(1),
    };
    await expect(computeMerkleRoot([base], 0)).rejects.toThrow(/mismatch/);
    await expect(computeMerkleRoot([base, { ...base }], 2)).rejects.toThrow(/Duplicate/);
  });
});

it('encodes opaque nonfinancial record types and rejects malformed or oversized identifiers', () => {
  const type = 'weather.observation';
  const info = encodeRowInfo(type);
  const { decodeRowInfo, decodeRowHeader } = jest.requireActual(
    '@/src/services/crypto/protocol/rowHeader',
  );
  expect(decodeRowInfo(info)).toBe(type);
  const header = {
    workplaceId: 'w',
    table: type,
    rowId: 'r',
    updatedAt: 1,
    deleted: false,
    keyId: 'k',
    salt: new Uint8Array(16),
  };
  expect(decodeRowHeader(encodeRowHeader(header))).toEqual(header);
  for (const table of ['', 'x'.repeat(129), '\ud800', '😀'.repeat(33)]) {
    expect(() => encodeRowInfo(table)).toThrow();
    expect(() => encodeRowHeader({ ...header, table })).toThrow();
  }
});

it('uses a 128-byte UTF-8 limit for record header and key-info encoding and decoding', () => {
  const { decodeRowInfo, decodeRowHeader } = jest.requireActual(
    '@/src/services/crypto/protocol/rowHeader',
  );
  const header = {
    workplaceId: 'w',
    table: 'weather',
    rowId: 'r',
    updatedAt: 1,
    deleted: false,
    keyId: 'k',
    salt: new Uint8Array(16),
  };
  for (const table of [
    'x'.repeat(64),
    'x'.repeat(65),
    'x'.repeat(127),
    'x'.repeat(128),
    'é'.repeat(32) + 'a',
    'é'.repeat(63) + 'a',
    'é'.repeat(64),
    '😀'.repeat(32),
  ]) {
    expect(decodeRowInfo(encodeRowInfo(table))).toBe(table);
    expect(decodeRowHeader(encodeRowHeader({ ...header, table })).table).toBe(table);
    const wire = serializeRowEnvelope({
      ...header,
      table,
      format: 'full-frills-encrypted-row',
      formatVersion: 1,
      enc: 'shortkey1+zstd',
      ciphertext: new Uint8Array(16),
    });
    expect(parseRowEnvelope(wire).table).toBe(table);
  }
  for (const table of ['x'.repeat(129), 'é'.repeat(64) + 'a', '😀'.repeat(32) + 'a']) {
    expect(encodeUtf8(table).length).toBe(129);
    expect(() => encodeRowInfo(table)).toThrow(/128 UTF-8 bytes/);
    expect(() => encodeRowHeader({ ...header, table })).toThrow(/128 UTF-8 bytes/);
    // Construct invalid wire bytes without routing through the guarded encoders.
    const fields = decodeTlv(encodeRowHeader(header), 1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    fields.set(5, encodeUtf8(table));
    expect(() =>
      decodeRowHeader(
        encodeTlv(
          1,
          [...fields].map(([tag, value]) => ({ tag, value })),
        ),
      ),
    ).toThrow(/128 UTF-8 bytes/);
    expect(() =>
      decodeRowInfo(
        encodeTlv(2, [
          { tag: 1, value: encodeUtf8('FFB-ROW/1') },
          { tag: 2, value: encodeUtf8(table) },
        ]),
      ),
    ).toThrow(/128 UTF-8 bytes/);
  }
});
