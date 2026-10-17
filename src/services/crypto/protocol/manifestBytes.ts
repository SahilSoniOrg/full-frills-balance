import { cryptoProvider } from '@/src/services/backup/cryptoProvider';
import * as tlvCodec from './tlv';
import {
  encodeInt64Milliseconds,
  encodeTlv,
  encodeUvarint,
  encodeUtf8,
  assertSafeNonnegativeInteger,
} from './tlv';

export type RowManifestFields = {
  formatVersion: number;
  workplaceId: string;
  keyId: string;
  id: string;
  seq: number;
  prevHash: Uint8Array;
  authorUserId: string;
  authorDeviceId: string;
  rowCount: number;
  root: Uint8Array;
  createdAt: number;
};

export function encodeManifestBytes(fields: RowManifestFields): Uint8Array {
  for (const [label, value] of [
    ['formatVersion', fields.formatVersion],
    ['seq', fields.seq],
    ['rowCount', fields.rowCount],
  ] as const)
    assertSafeNonnegativeInteger(value, label);
  if (fields.prevHash.length !== 32 || fields.root.length !== 32)
    throw new Error('Manifest hashes must be 32 bytes');
  return encodeTlv(0x03, [
    { tag: 1, value: encodeUtf8('FFB-MANIFEST/1') },
    { tag: 2, value: encodeUvarint(fields.formatVersion) },
    { tag: 3, value: encodeUtf8(fields.workplaceId, 'workplaceId', true) },
    { tag: 4, value: encodeUtf8(fields.keyId, 'keyId', true) },
    { tag: 5, value: encodeUtf8(fields.id, 'id', true) },
    { tag: 6, value: encodeUvarint(fields.seq) },
    { tag: 7, value: fields.prevHash },
    { tag: 8, value: encodeUtf8(fields.authorUserId, 'authorUserId', true) },
    {
      tag: 9,
      value: encodeUtf8(fields.authorDeviceId, 'authorDeviceId', true),
    },
    { tag: 10, value: encodeUvarint(fields.rowCount) },
    { tag: 11, value: fields.root },
    { tag: 12, value: encodeInt64Milliseconds(fields.createdAt) },
  ]);
}

export async function hashManifest(
  fieldsOrBytes: RowManifestFields | Uint8Array,
): Promise<Uint8Array> {
  const bytes =
    fieldsOrBytes instanceof Uint8Array ? fieldsOrBytes : encodeManifestBytes(fieldsOrBytes);
  return cryptoProvider.digest(bytes);
}

export function decodeManifestBytes(bytes: Uint8Array): RowManifestFields {
  const { decodeTlv, decodeUvarint, decodeUtf8, decodeInt64Milliseconds } = tlvCodec;
  const f = decodeTlv(bytes, 0x03, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  if (decodeUtf8(f.get(1)!, 'manifest domain') !== 'FFB-MANIFEST/1')
    throw new Error('Invalid manifest domain');
  const numberField = (tag: number, label: string): number => {
    const raw = f.get(tag)!;
    const decoded = decodeUvarint(raw);
    if (decoded.bytesRead !== raw.length) throw new Error(`Trailing ${label} bytes`);
    return decoded.value;
  };
  const prevHash = f.get(7)!,
    root = f.get(11)!;
  if (prevHash.length !== 32 || root.length !== 32)
    throw new Error('Manifest hashes must be 32 bytes');
  const fields: RowManifestFields = {
    formatVersion: numberField(2, 'formatVersion'),
    workplaceId: decodeUtf8(f.get(3)!, 'workplaceId'),
    keyId: decodeUtf8(f.get(4)!, 'keyId'),
    id: decodeUtf8(f.get(5)!, 'id'),
    seq: numberField(6, 'seq'),
    prevHash,
    authorUserId: decodeUtf8(f.get(8)!, 'authorUserId'),
    authorDeviceId: decodeUtf8(f.get(9)!, 'authorDeviceId'),
    rowCount: numberField(10, 'rowCount'),
    root,
    createdAt: decodeInt64Milliseconds(f.get(12)!),
  };
  for (const [label, value] of [
    ['workplaceId', fields.workplaceId],
    ['keyId', fields.keyId],
    ['id', fields.id],
    ['authorUserId', fields.authorUserId],
    ['authorDeviceId', fields.authorDeviceId],
  ] as const)
    encodeUtf8(value, label, true);
  if (!equalBytes(encodeManifestBytes(fields), bytes)) throw new Error('Noncanonical manifest TLV');
  return fields;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
