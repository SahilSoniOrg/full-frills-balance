import { parseObject, assertExactKeys } from '@/src/utils/strictObject';
import { encodeInt64Milliseconds, encodeUtf8, assertSafeNonnegativeInteger } from './tlv';
import { ROW_ENCODING, ROW_FORMAT, ROW_TABLES, RowHeader, RowTable } from './rowHeader';

export type RowEnvelope = RowHeader & {
  format: typeof ROW_FORMAT;
  formatVersion: 1;
  enc: typeof ROW_ENCODING;
  ciphertext: Uint8Array;
};
export type RowEnvelopeJson = Omit<RowEnvelope, 'salt' | 'ciphertext'> & {
  salt: string;
  ciphertext: string;
};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i],
      hasB = i + 1 < bytes.length,
      hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0,
      c = hasC ? bytes[i + 2] : 0;
    out +=
      alphabet[a >> 2] +
      alphabet[((a & 3) << 4) | (b >> 4)] +
      (hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : '=') +
      (hasC ? alphabet[c & 63] : '=');
  }
  return out;
}

export function decodeBase64(value: string): Uint8Array {
  if (
    typeof value !== 'string' ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new Error('Invalid base64');
  const output: number[] = [];
  for (let i = 0; i < value.length; i += 4) {
    const a = alphabet.indexOf(value[i]),
      b = alphabet.indexOf(value[i + 1]);
    const c = value[i + 2] === '=' ? 0 : alphabet.indexOf(value[i + 2]);
    const d = value[i + 3] === '=' ? 0 : alphabet.indexOf(value[i + 3]);
    output.push((a << 2) | (b >> 4));
    if (value[i + 2] !== '=') output.push(((b & 15) << 4) | (c >> 2));
    if (value[i + 3] !== '=') output.push(((c & 3) << 6) | d);
  }
  const bytes = Uint8Array.from(output);
  if (encodeBase64(bytes) !== value) throw new Error('Noncanonical base64');
  return bytes;
}

export function parseRowEnvelope(value: unknown): RowEnvelope {
  const record = parseObject(value, 'Envelope must be an object');
  const keys = [
    'format',
    'formatVersion',
    'enc',
    'workplaceId',
    'table',
    'rowId',
    'updatedAt',
    'deleted',
    'keyId',
    'salt',
    'ciphertext',
  ];
  assertExactKeys(record, keys, 'Envelope has missing or unknown fields');
  if (record.format !== ROW_FORMAT || record.formatVersion !== 1 || record.enc !== ROW_ENCODING)
    throw new Error('Unsupported envelope format');
  if (typeof record.table !== 'string' || !ROW_TABLES.includes(record.table as RowTable))
    throw new Error('Unknown row table');
  for (const key of ['workplaceId', 'rowId', 'keyId'] as const)
    encodeUtf8(record[key] as string, key, true);
  if (typeof record.updatedAt !== 'number' || !Number.isSafeInteger(record.updatedAt))
    throw new Error('updatedAt must be a safe integer');
  encodeInt64Milliseconds(record.updatedAt);
  assertSafeNonnegativeInteger(record.formatVersion as number, 'formatVersion');
  if (typeof record.deleted !== 'boolean') throw new Error('deleted must be boolean');
  const salt = decodeBase64(record.salt as string);
  if (salt.length !== 16) throw new Error('salt must be 16 bytes');
  return {
    format: ROW_FORMAT,
    formatVersion: 1,
    enc: ROW_ENCODING,
    workplaceId: record.workplaceId as string,
    table: record.table as RowTable,
    rowId: record.rowId as string,
    updatedAt: record.updatedAt,
    deleted: record.deleted,
    keyId: record.keyId as string,
    salt,
    ciphertext: decodeBase64(record.ciphertext as string),
  };
}

export function serializeRowEnvelope(envelope: RowEnvelope): RowEnvelopeJson {
  const checked = parseRowEnvelope({
    ...envelope,
    salt: encodeBase64(envelope.salt),
    ciphertext: encodeBase64(envelope.ciphertext),
  });
  return {
    ...checked,
    salt: encodeBase64(checked.salt),
    ciphertext: encodeBase64(checked.ciphertext),
  };
}
