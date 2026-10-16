import {
  assertExactKeys,
  isHexId,
  isSha256Id,
  parseObject as jsonObject,
} from '@/src/utils/strictObject';
import { keyBytes } from '@/src/services/backup/keyEncoding';
import {
  parseRowEnvelope as parseCodecEnvelope,
  type RowEnvelope as ProtocolRowEnvelope,
  type RowEnvelopeJson as ProtocolRowEnvelopeJson,
} from './envelopeJson';
import { encodeRowHeader } from './rowHeader';
import { encodeManifestBytes, type RowManifestFields } from './manifestBytes';
import { assertSafeNonnegativeInteger, encodeUtf8 } from './tlv';
import { MAX_ROW_CIPHERTEXT_BYTES } from './rowCrypto';

export type RowEnvelope = ProtocolRowEnvelope;
export type RowEnvelopeJson = ProtocolRowEnvelopeJson;
export { MAX_ROW_CIPHERTEXT_BYTES } from './rowCrypto';
export type RowScope = Readonly<{ workplaceId: string; keyId: string }>;
/** keyId is the public DEK fingerprint (`sha256:...`), never a native handle.
 * authorUserId must come from the externally pinned public User identity.
 * Public identity fingerprint verification belongs to manifestVerify, not JSON. */
export type ManifestScope = RowScope & Readonly<{ authorUserId: string }>;
export type RowManifestJson = Omit<RowManifestFields, 'root' | 'prevHash'> & {
  formatVersion: 1;
  root: string;
  prevHash: string;
  signature: string;
};
export type ParsedRowManifest = Readonly<{
  fields: RowManifestFields;
  signature: string;
  signedBytes: Uint8Array;
}>;

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${label}`);
  encodeUtf8(value, label, true);
}
function checkScope(scope: RowScope): void {
  identifier(scope.workplaceId, 'scope workplaceId');
  if (!isSha256Id(scope.keyId)) throw new Error('Invalid scope public key fingerprint');
}
/** Uses the prepared codec for all base64 and AAD bytes. Limit checks happen
 * BEFORE decoding an attacker-controlled ciphertext allocation. */
export function parseRowEnvelope(value: unknown, scope: RowScope): RowEnvelope {
  checkScope(scope);
  const raw = jsonObject(value, 'row envelope');
  identifier(raw.workplaceId, 'workplaceId');
  identifier(raw.rowId, 'rowId');
  if (!isSha256Id(raw.keyId)) throw new Error('Invalid public key fingerprint');
  if (raw.workplaceId !== scope.workplaceId || raw.keyId !== scope.keyId)
    throw new Error('Row scope mismatch');
  if (typeof raw.salt !== 'string' || raw.salt.length !== 24) throw new Error('Invalid salt');
  if (
    typeof raw.ciphertext !== 'string' ||
    raw.ciphertext.length > Math.ceil(MAX_ROW_CIPHERTEXT_BYTES / 3) * 4
  )
    throw new Error('FFB_ROW_TOO_LARGE: ciphertext');
  const envelope = parseCodecEnvelope(raw);
  if (envelope.ciphertext.length < 16) throw new Error('Missing GCM authentication tag');
  if (envelope.ciphertext.length > MAX_ROW_CIPHERTEXT_BYTES)
    throw new Error('FFB_ROW_TOO_LARGE: ciphertext');
  encodeRowHeader(envelope);
  return { ...envelope, table: envelope.table };
}
/** Bytes for Merkle leaves/AAD, never canonical JSON of the wire envelope. */
export function rowEnvelopeAad(value: unknown, scope: RowScope): Uint8Array {
  return encodeRowHeader(parseRowEnvelope(value, scope));
}

const MANIFEST_KEYS = [
  'formatVersion',
  'workplaceId',
  'keyId',
  'id',
  'seq',
  'prevHash',
  'authorUserId',
  'authorDeviceId',
  'rowCount',
  'root',
  'createdAt',
  'signature',
] as const;
/** Shape/scope validation only. A valid signature encoding is NOT a verified
 * signature. Caller verifies signedBytes against the pinned User signing key. */
export function parseRowManifest(value: unknown, scope: ManifestScope): ParsedRowManifest {
  checkScope(scope);
  identifier(scope.authorUserId, 'scope authorUserId');
  const raw = jsonObject(value, 'manifest');
  assertExactKeys(raw, MANIFEST_KEYS, 'Missing or unknown manifest field');
  if (raw.formatVersion !== 1) throw new Error('Unsupported manifest version');
  for (const key of ['workplaceId', 'id', 'authorUserId', 'authorDeviceId'])
    identifier(raw[key], key);
  if (!isSha256Id(raw.keyId)) throw new Error('Invalid manifest public key fingerprint');
  if (
    raw.workplaceId !== scope.workplaceId ||
    raw.keyId !== scope.keyId ||
    raw.authorUserId !== scope.authorUserId
  )
    throw new Error('Manifest scope mismatch');
  for (const key of ['seq', 'rowCount']) {
    if (typeof raw[key] !== 'number') throw new Error(`Invalid manifest ${key}`);
    assertSafeNonnegativeInteger(raw[key], key);
  }
  if (typeof raw.createdAt !== 'number' || !Number.isSafeInteger(raw.createdAt))
    throw new Error('Invalid manifest createdAt');
  if (!isHexId(raw.prevHash, 64) || !isHexId(raw.root, 64))
    throw new Error('Invalid manifest hash encoding');
  if (!isHexId(raw.signature, 128)) throw new Error('Invalid Ed25519 signature hex');
  if (raw.seq === 0 && raw.prevHash !== '0'.repeat(64))
    throw new Error('Genesis prevHash must be zero');
  const fields: RowManifestFields = {
    formatVersion: 1,
    workplaceId: raw.workplaceId as string,
    keyId: raw.keyId as string,
    id: raw.id as string,
    seq: raw.seq as number,
    prevHash: keyBytes(raw.prevHash),
    authorUserId: raw.authorUserId as string,
    authorDeviceId: raw.authorDeviceId as string,
    rowCount: raw.rowCount as number,
    root: keyBytes(raw.root),
    createdAt: raw.createdAt,
  };
  return { fields, signature: raw.signature, signedBytes: encodeManifestBytes(fields) };
}
/** Full state, tombstones included. No crypto/DB work here. Merkle computation
 * and signature verification are separate mandatory checks before publication. */
export function validateCompleteEnvelopeState(
  values: readonly unknown[],
  scope: RowScope,
  rowCount: number,
): readonly RowEnvelope[] {
  assertSafeNonnegativeInteger(rowCount, 'rowCount');
  if (values.length !== rowCount) throw new Error('State rowCount mismatch');
  const rows = values.map(value => parseRowEnvelope(value, scope));
  assertCompleteStateMembership(rows, rowCount);
  return rows;
}
export function assertCompleteStateMembership(
  rows: readonly RowEnvelope[],
  rowCount: number,
): void {
  assertSafeNonnegativeInteger(rowCount, 'rowCount');
  if (rows.length !== rowCount) throw new Error('State rowCount mismatch');
  const keys = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify([row.table, row.rowId]);
    if (keys.has(key)) throw new Error('Duplicate state row key');
    keys.add(key);
  }
}
