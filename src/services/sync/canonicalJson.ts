import { encodeUtf8, decodeUtf8 } from '@/src/services/crypto/protocol/tlv';
import { cryptoProvider } from '../backup/cryptoProvider';
import { keyHex } from '../backup/keyEncoding';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Plain own data properties only: no getters, symbols, inherited data or toJSON.
 * Reject rather than silently erase values that JSON.stringify would discard. */
export function jsonObject(value: unknown, label = 'JSON object'): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid ${label}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`Non-plain ${label}`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new Error(`Non-JSON property in ${label}`);
  }
  return value as Record<string, unknown>;
}

/** UTF-16 lexicographic key order, arrays preserved, ECMAScript JSON numbers
 * (-0 -> 0). No Unicode normalization. Unpaired surrogates are rejected using
 * the shared codec UTF-8 policy. Numeric-looking keys are sorted as strings. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (item: unknown): string => {
    if (item === null) return 'null';
    if (typeof item === 'string') {
      encodeUtf8(item);
      return JSON.stringify(item);
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('Non-finite JSON number');
      return JSON.stringify(item);
    }
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item !== 'object') throw new Error(`Non-JSON value: ${typeof item}`);
    if (ancestors.has(item)) throw new Error('Cyclic JSON value');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        if (
          Object.getPrototypeOf(item) !== Array.prototype ||
          Reflect.ownKeys(item).length !== item.length + 1
        )
          throw new Error('Sparse or decorated JSON array');
        const parts: string[] = [];
        for (let index = 0; index < item.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
            throw new Error('Sparse or accessor JSON array');
          parts.push(visit(descriptor.value));
        }
        return `[${parts.join(',')}]`;
      }
      const object = jsonObject(item);
      return `{${Object.keys(object)
        .sort()
        .map(key => {
          encodeUtf8(key, 'JSON key');
          return `${JSON.stringify(key)}:${visit(object[key])}`;
        })
        .join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  };
  return visit(value);
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return encodeUtf8(canonicalJson(value));
}
/** Decode only canonical wire JSON. This also rejects duplicate JSON keys,
 * alternate escapes/whitespace and lossy numeric representations. */
export function parseCanonicalJson(bytes: Uint8Array): JsonValue {
  const text = decodeUtf8(bytes, 'canonical JSON');
  const value: unknown = JSON.parse(text);
  if (canonicalJson(value) !== text) throw new Error('Noncanonical JSON');
  return value as JsonValue;
}
export async function contentHash(value: unknown): Promise<string> {
  return keyHex(await cryptoProvider.digest(canonicalJsonBytes(value)));
}
