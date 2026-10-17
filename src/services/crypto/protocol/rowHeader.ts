import {
  MAX_IDENTIFIER_UTF8_BYTES,
  decodeInt64Milliseconds,
  decodeTlv,
  decodeUvarint,
  decodeUtf8,
  encodeInt64Milliseconds,
  encodeTlv,
  encodeUvarint,
  encodeUtf8,
  assertSafeNonnegativeInteger,
} from './tlv';

export const ROW_FORMAT = 'full-frills-encrypted-row' as const;
export const ROW_FORMAT_VERSION = 1 as const;
export const ROW_ENCODING = 'shortkey1+zstd' as const;
/** Opaque protocol record type, bounded exactly like other wire identifiers. */
export type RecordType = string;
export function assertRecordType(value: unknown): asserts value is RecordType {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Invalid record type');
  encodeUtf8(value, 'table', true);
}
export type RowHeader = {
  workplaceId: string;
  table: RecordType;
  rowId: string;
  updatedAt: number;
  deleted: boolean;
  keyId: string;
  salt: Uint8Array;
};

export function encodeRowHeader(header: RowHeader): Uint8Array {
  assertRecordType(header.table);
  if (typeof header.deleted !== 'boolean') throw new Error('deleted must be boolean');
  if (header.salt.length !== 16) throw new Error('salt must be 16 bytes');
  assertSafeNonnegativeInteger(ROW_FORMAT_VERSION, 'formatVersion');
  return encodeTlv(0x01, [
    { tag: 1, value: encodeUtf8(ROW_FORMAT) },
    { tag: 2, value: encodeUvarint(ROW_FORMAT_VERSION) },
    { tag: 3, value: encodeUtf8(ROW_ENCODING) },
    { tag: 4, value: encodeUtf8(header.workplaceId, 'workplaceId', true) },
    { tag: 5, value: encodeUtf8(header.table) },
    { tag: 6, value: encodeUtf8(header.rowId, 'rowId', true) },
    { tag: 7, value: encodeInt64Milliseconds(header.updatedAt) },
    { tag: 8, value: Uint8Array.of(header.deleted ? 1 : 0) },
    { tag: 9, value: encodeUtf8(header.keyId, 'keyId', true) },
    { tag: 10, value: header.salt },
  ]);
}

export function decodeRowHeader(bytes: Uint8Array): RowHeader {
  const f = decodeTlv(bytes, 0x01, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  if (
    decodeUtf8(f.get(1)!, 'format') !== ROW_FORMAT ||
    decodeUtf8(f.get(3)!, 'enc') !== ROW_ENCODING
  )
    throw new Error('Invalid row format');
  if (f.get(2)!.length !== 1 || f.get(2)![0] !== 1) throw new Error('Invalid row formatVersion');
  const table = decodeUtf8(f.get(5)!, 'table');
  assertRecordType(table);
  if (f.get(8)!.length !== 1 || f.get(8)![0] > 1) throw new Error('Invalid deleted flag');
  if (f.get(10)!.length !== 16) throw new Error('salt must be 16 bytes');
  return {
    workplaceId: decodeUtf8Identifier(f.get(4)!, 'workplaceId'),
    table,
    rowId: decodeUtf8Identifier(f.get(6)!, 'rowId'),
    updatedAt: decodeInt64Milliseconds(f.get(7)!),
    deleted: f.get(8)![0] === 1,
    keyId: decodeUtf8Identifier(f.get(9)!, 'keyId'),
    salt: f.get(10)!,
  };
}

function decodeUtf8Identifier(bytes: Uint8Array, label: string): string {
  const value = decodeUtf8(bytes, label);
  if (bytes.length > MAX_IDENTIFIER_UTF8_BYTES) throw new Error(`${label} exceeds 128 UTF-8 bytes`);
  return value;
}

export function encodeRowInfo(table: RecordType): Uint8Array {
  assertRecordType(table);
  return encodeTlv(0x02, [
    { tag: 1, value: encodeUtf8('FFB-ROW/1') },
    { tag: 2, value: encodeUtf8(table) },
  ]);
}

export function decodeRowInfo(bytes: Uint8Array): RecordType {
  const f = decodeTlv(bytes, 0x02, [1, 2]);
  if (decodeUtf8(f.get(1)!, 'info domain') !== 'FFB-ROW/1')
    throw new Error('Invalid row info domain');
  const table = decodeUtf8(f.get(2)!, 'table');
  assertRecordType(table);
  return table;
}

export function encodeInnerPlaintext(
  schemaVersion: number,
  dictId: string,
  body: Uint8Array,
): Uint8Array {
  assertSafeNonnegativeInteger(schemaVersion, 'schemaVersion');
  return encodeTlv(0x04, [
    { tag: 1, value: encodeUvarint(schemaVersion) },
    { tag: 2, value: encodeUtf8(dictId, 'dictId', true) },
    { tag: 3, value: body },
  ]);
}

export function decodeInnerPlaintext(bytes: Uint8Array): {
  schemaVersion: number;
  dictId: string;
  body: Uint8Array;
} {
  const f = decodeTlv(bytes, 0x04, [1, 2, 3]);
  const { value, bytesRead } = decodeUvarint(f.get(1)!);
  if (bytesRead !== f.get(1)!.length) throw new Error('Trailing schemaVersion bytes');
  if (f.get(1)!.length !== bytesForUvarint(value)) throw new Error('Noncanonical schemaVersion');
  const dictId = decodeUtf8(f.get(2)!, 'dictId');
  encodeUtf8(dictId, 'dictId', true);
  return { schemaVersion: value, dictId, body: f.get(3)! };
}

function bytesForUvarint(value: number): number {
  return encodeUvarint(value).length;
}
