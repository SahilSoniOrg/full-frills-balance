/** Wire identifier bound, measured in UTF-8 bytes (also used by the native codec). */
export const MAX_IDENTIFIER_UTF8_BYTES = 128;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export type TlvField = { tag: number; value: Uint8Array };

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function encodeUvarint(value: number): Uint8Array {
  assertSafeNonnegativeInteger(value, 'uvarint');
  const bytes: number[] = [];
  let remaining = BigInt(value);
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return Uint8Array.from(bytes);
}

export function decodeUvarint(bytes: Uint8Array, offset = 0): { value: number; bytesRead: number } {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length)
    throw new Error('Invalid varint offset');
  let value = 0n;
  let shift = 0n;
  for (let i = offset; i < bytes.length && i - offset < 8; i += 1) {
    const byte = bytes[i];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      const bytesRead = i - offset + 1;
      if (bytesRead > 1 && byte === 0) throw new Error('Nonminimal uvarint');
      if (value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Uvarint exceeds safe integer range');
      return { value: Number(value), bytesRead };
    }
    shift += 7n;
  }
  throw new Error('Truncated or overflowing uvarint');
}

export function encodeTlv(version: number, fields: readonly TlvField[]): Uint8Array {
  if (!Number.isInteger(version) || version < 0 || version > 255)
    throw new Error('Invalid TLV version');
  const chunks: Uint8Array[] = [Uint8Array.of(version)];
  let previous = 0;
  for (const field of fields) {
    if (!Number.isInteger(field.tag) || field.tag < 1 || field.tag > 255 || field.tag <= previous)
      throw new Error('TLV tags must be strictly increasing');
    previous = field.tag;
    chunks.push(Uint8Array.of(field.tag), encodeUvarint(field.value.length), field.value);
  }
  return concatBytes(...chunks);
}

export function decodeTlv(
  bytes: Uint8Array,
  version: number,
  requiredTags: readonly number[],
): Map<number, Uint8Array> {
  if (bytes.length === 0 || bytes[0] !== version) throw new Error('Unexpected TLV version');
  const allowed = new Set(requiredTags);
  const fields = new Map<number, Uint8Array>();
  let offset = 1;
  let previous = 0;
  while (offset < bytes.length) {
    const tag = bytes[offset++];
    if (tag <= previous) throw new Error('Duplicate or out-of-order TLV tag');
    if (!allowed.has(tag)) throw new Error('Unknown TLV tag');
    previous = tag;
    const length = decodeUvarint(bytes, offset);
    offset += length.bytesRead;
    if (length.value > bytes.length - offset) throw new Error('Truncated TLV value');
    fields.set(tag, bytes.slice(offset, offset + length.value));
    offset += length.value;
  }
  if (offset !== bytes.length) throw new Error('Trailing TLV bytes');
  if (fields.size !== requiredTags.length || requiredTags.some(tag => !fields.has(tag)))
    throw new Error('Missing TLV tag');
  return fields;
}

export function encodeUtf8(value: string, label = 'string', identifier = false): Uint8Array {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new Error(`${label} contains an unpaired surrogate`);
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff)
      throw new Error(`${label} contains an unpaired surrogate`);
  }
  const bytes = encoder.encode(value);
  if (identifier && bytes.length > MAX_IDENTIFIER_UTF8_BYTES)
    throw new Error(`${label} exceeds 128 UTF-8 bytes`);
  return bytes;
}

export function decodeUtf8(value: Uint8Array, label = 'string'): string {
  try {
    const decoded = decoder.decode(value);
    const reencoded = encoder.encode(decoded);
    if (reencoded.length !== value.length || reencoded.some((byte, i) => byte !== value[i]))
      throw new Error('Noncanonical UTF-8');
    return decoded;
  } catch {
    throw new Error(`${label} is malformed UTF-8`);
  }
}

export function assertSafeNonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a safe nonnegative integer`);
}

export function encodeInt64Milliseconds(value: number): Uint8Array {
  if (!Number.isSafeInteger(value)) throw new Error('Timestamp must be a safe integer');
  const n = BigInt(value);
  const encoded = n < 0 ? (1n << 64n) + n : n;
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i -= 1) bytes[7 - i] = Number((encoded >> BigInt(i * 8)) & 0xffn);
  return bytes;
}

export function decodeInt64Milliseconds(value: Uint8Array): number {
  if (value.length !== 8) throw new Error('Timestamp must be 8 bytes');
  let n = 0n;
  for (const byte of value) n = (n << 8n) | BigInt(byte);
  if (n & (1n << 63n)) n -= 1n << 64n;
  const number = Number(n);
  if (!Number.isSafeInteger(number)) throw new Error('Timestamp exceeds safe integer range');
  return number;
}
