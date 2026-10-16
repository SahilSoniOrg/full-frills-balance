import { parseRowManifest, type RowManifestJson } from '@/src/services/crypto/protocol/rowEnvelope';
import { parseRowEnvelope, rowEnvelopeAad, validateCompleteEnvelopeState } from '../rowEnvelope';
import { encodeBase64 } from '@/src/services/crypto/protocol/envelopeJson';
import { encodeRowHeader } from '@/src/services/crypto/protocol/rowHeader';
import { encodeManifestBytes } from '@/src/services/crypto/protocol/manifestBytes';

const scope = { workplaceId: 'w1', keyId: `sha256:${'a'.repeat(64)}`, authorUserId: 'u1' };
const envelope = {
  format: 'full-frills-encrypted-row',
  formatVersion: 1,
  enc: 'shortkey1+zstd',
  workplaceId: 'w1',
  table: 'transactions',
  rowId: 'r1',
  updatedAt: 10,
  deleted: false,
  keyId: scope.keyId,
  salt: encodeBase64(new Uint8Array(16)),
  ciphertext: encodeBase64(new Uint8Array(16)),
};
const metadata = { ...envelope, table: 'workplace', rowId: 'w1' };
const manifest: RowManifestJson = {
  formatVersion: 1,
  workplaceId: 'w1',
  keyId: scope.keyId,
  id: 'm1',
  seq: 0,
  prevHash: '0'.repeat(64),
  authorUserId: 'u1',
  authorDeviceId: 'd1',
  rowCount: 2,
  root: 'b'.repeat(64),
  createdAt: 10,
  signature: 'c'.repeat(128),
};

describe('wire envelope and manifest validation', () => {
  test('AAD is the prepared codec header and changes with authenticated metadata', () => {
    const parsed = parseRowEnvelope(envelope, scope);
    expect(rowEnvelopeAad(envelope, scope)).toEqual(encodeRowHeader(parsed));
    expect(rowEnvelopeAad({ ...envelope, updatedAt: 11 }, scope)).not.toEqual(
      rowEnvelopeAad(envelope, scope),
    );
    expect(rowEnvelopeAad({ ...envelope, deleted: true }, scope)).not.toEqual(
      rowEnvelopeAad(envelope, scope),
    );
    expect(() => parseRowEnvelope({ ...envelope, workplaceId: 'w2' }, scope)).toThrow(/scope/);
    expect(() => parseRowEnvelope({ ...envelope, keyId: 'a'.repeat(64) }, scope)).toThrow(
      /fingerprint/,
    );
    expect(() =>
      parseRowEnvelope({ ...envelope, keyId: `sha256:${'b'.repeat(64)}` }, scope),
    ).toThrow(/scope/);
  });
  test('rejects excess fields, missing fields, loose primitives, bad base64 and allocation attacks', () => {
    expect(() => parseRowEnvelope({ ...envelope, schemaVersion: 35 }, scope)).toThrow(/unknown/);
    const { enc: _enc, ...missing } = envelope;
    expect(() => parseRowEnvelope(missing, scope)).toThrow();
    for (const row of [
      { ...envelope, deleted: 1 },
      { ...envelope, updatedAt: NaN },
      { ...envelope, table: 'sync_conflicts' },
      { ...envelope, salt: 'A'.repeat(24) },
      { ...envelope, ciphertext: 'AA==' },
      { ...envelope, ciphertext: encodeBase64(new Uint8Array(16)).slice(0, -2) + 'B=' },
    ])
      expect(() => parseRowEnvelope(row, scope)).toThrow();
    expect(() => parseRowEnvelope({ ...envelope, ciphertext: 'A'.repeat(100000) }, scope)).toThrow(
      /TOO_LARGE/,
    );
    expect(() =>
      parseRowEnvelope(
        { ...envelope, ciphertext: encodeBase64(new Uint8Array(68 * 1024 + 1)) },
        scope,
      ),
    ).toThrow(/TOO_LARGE/);
  });
  test('complete state requires one live scoped metadata row and unique table/id pairs', () => {
    expect(validateCompleteEnvelopeState([metadata, envelope], scope, 2)).toHaveLength(2);
    expect(
      validateCompleteEnvelopeState(
        [metadata, envelope, { ...envelope, table: 'accounts' }],
        scope,
        3,
      ),
    ).toHaveLength(3);
    expect(() => validateCompleteEnvelopeState([envelope], scope, 1)).toThrow(/workplace/);
    expect(() =>
      validateCompleteEnvelopeState([metadata, { ...metadata, deleted: true }], scope, 2),
    ).toThrow(/workplace/);
    expect(() => validateCompleteEnvelopeState([metadata, envelope, envelope], scope, 3)).toThrow(
      /Duplicate/,
    );
    expect(() => validateCompleteEnvelopeState([metadata], scope, 2)).toThrow(/rowCount/);
    expect(() => parseRowEnvelope({ ...metadata, rowId: 'w2' }, scope)).toThrow(/workplace/);
  });
  test('manifest signature is hex; key and author are public, caller-pinned scopes', () => {
    const parsed = parseRowManifest(manifest, scope);
    expect(parsed.signedBytes).toEqual(encodeManifestBytes(parsed.fields));
    expect(parsed.signature).toBe(manifest.signature);
    // Parsing deliberately does not claim these dummy signatures are authentic.
    for (const value of [
      { ...manifest, signature: 'C'.repeat(128) },
      { ...manifest, signature: encodeBase64(new Uint8Array(64)) },
      { ...manifest, keyId: 'native-secret-handle' },
      { ...manifest, authorUserId: 'u2' },
      { ...manifest, workplaceId: 'w2' },
      { ...manifest, seq: 0, prevHash: '1'.repeat(64) },
      { ...manifest, seq: 1.5 },
      { ...manifest, rowCount: -1 },
      { ...manifest, root: 'A'.repeat(64) },
      { ...manifest, extra: true },
    ])
      expect(() => parseRowManifest(value, scope)).toThrow();
    expect(() =>
      parseRowManifest({ ...manifest, seq: 1, prevHash: 'd'.repeat(64) }, scope),
    ).not.toThrow();
    expect(() => parseRowManifest({ ...manifest, rowCount: 0 }, scope)).not.toThrow();
  });
});

it('accepts nonfinancial protocol records but rejects them in the financial profile', () => {
  const generic = jest.requireActual('@/src/services/crypto/protocol/rowEnvelope');
  const weather = { ...envelope, table: 'weather.observation' };
  expect(generic.parseRowEnvelope(weather, scope).table).toBe(weather.table);
  expect(() => parseRowEnvelope(weather, scope)).toThrow(/Unknown row table/);
  expect(() => validateCompleteEnvelopeState([metadata, weather], scope, 2)).toThrow(
    /Unknown row table/,
  );
});
