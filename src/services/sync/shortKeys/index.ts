import { canonicalJsonBytes, jsonObject, parseCanonicalJson, contentHash } from '../canonicalJson';
import {
  getRowTable,
  INITIAL_SCHEMA_VERSION,
  CURRENT_ROW_SCHEMA_VERSION,
  validateRowContent,
  type RowTable,
} from '../rowTables';
import { upgradeRow } from '../rowUpgrades';
import { versions as accounts } from './accounts';
import { versions as journals } from './journals';
import { versions as transactions } from './transactions';
import { versions as audit_logs } from './audit_logs';
import { versions as budgets } from './budgets';
import { versions as budget_scopes } from './budget_scopes';
import { versions as account_metadata } from './account_metadata';
import { versions as planned_payments } from './planned_payments';
import { versions as journal_metadata } from './journal_metadata';
import { versions as transaction_auto_post_rules } from './transaction_auto_post_rules';
import { versions as transaction_inbox_records } from './transaction_inbox_records';
import { versions as workplace } from './workplace';

import { MAX_ROW_PLAINTEXT_BYTES } from '../rowCrypto';
export { MAX_ROW_PLAINTEXT_BYTES } from '../rowCrypto';
export type ShortKeyMap = Readonly<Record<string, string>>;
export type RetainedShortKeyMaps = Readonly<Record<number, ShortKeyMap>>;
export const SHORT_KEY_MAPS: Readonly<Record<RowTable, RetainedShortKeyMaps>> = Object.freeze({
  accounts,
  journals,
  transactions,
  audit_logs,
  budgets,
  budget_scopes,
  account_metadata,
  planned_payments,
  journal_metadata,
  transaction_auto_post_rules,
  transaction_inbox_records,
  workplace,
});
/** Useful for future map additions: retained assignments cannot move, disappear
 * or reuse a token. Versions are selected exactly, never by nearest-lower match. */
export function assertAdditiveMapHistory(versions: RetainedShortKeyMaps): void {
  let previous: ShortKeyMap = {};
  for (const version of Object.keys(versions)
    .map(Number)
    .sort((a, b) => a - b)) {
    if (!Number.isSafeInteger(version) || version < INITIAL_SCHEMA_VERSION)
      throw new Error('Invalid map version');
    const map = versions[version];
    const keys = Object.values(map);
    if (new Set(keys).size !== keys.length || keys.some(key => !/^[a-z][a-z0-9]*$/.test(key)))
      throw new Error('Invalid or duplicate short key');
    for (const [field, key] of Object.entries(previous))
      if (map[field] !== key) throw new Error(`Immutable short-key assignment changed: ${field}`);
    previous = map;
  }
}
export function getShortKeyMap(table: RowTable, schemaVersion: number): ShortKeyMap {
  getRowTable(table);
  const map = SHORT_KEY_MAPS[table][schemaVersion];
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion > CURRENT_ROW_SCHEMA_VERSION || !map)
    throw new Error(`Unknown row schema: ${table}/${schemaVersion}`);
  return map;
}
export function encodeShortKeys(table: RowTable, value: unknown): Record<string, unknown> {
  const row = validateRowContent(table, value);
  const map = getShortKeyMap(table, CURRENT_ROW_SCHEMA_VERSION);
  return Object.fromEntries(
    Object.entries(row).map(([field, value]) => {
      if (!Object.hasOwn(map, field)) throw new Error(`Unknown ${table} field: ${field}`);
      return [map[field], value];
    }),
  );
}
export function decodeShortKeys(
  table: RowTable,
  schemaVersion: number,
  value: unknown,
): Record<string, unknown> {
  const map = getShortKeyMap(table, schemaVersion);
  const inverse = Object.fromEntries(Object.entries(map).map(([field, key]) => [key, field]));
  const encoded = jsonObject(value, 'short-key row');
  const row = Object.fromEntries(
    Object.entries(encoded).map(([key, value]) => {
      if (!Object.hasOwn(inverse, key)) throw new Error(`Unknown ${table} short key: ${key}`);
      return [inverse[key], value];
    }),
  );
  // V1 default: absent optional columns stay omitted, never invented as 0/false/''.
  // All required fields must be present. New defaults belong in schema transitions.
  return validateRowContent(table, upgradeRow(table, schemaVersion, row));
}
export function canonicalRowBytes(table: RowTable, value: unknown): Uint8Array {
  const bytes = canonicalJsonBytes(encodeShortKeys(table, value));
  if (bytes.length > MAX_ROW_PLAINTEXT_BYTES) throw new Error(`FFB_ROW_TOO_LARGE: ${table}`);
  return bytes;
}
export function decodeCanonicalRow(
  table: RowTable,
  schemaVersion: number,
  bytes: Uint8Array,
): Record<string, unknown> {
  if (bytes.length > MAX_ROW_PLAINTEXT_BYTES) throw new Error(`FFB_ROW_TOO_LARGE: ${table}`);
  return decodeShortKeys(table, schemaVersion, parseCanonicalJson(bytes));
}
/** Hash the encoded content, not header metadata or DB iteration order. */
export async function rowContentHash(table: RowTable, value: unknown): Promise<string> {
  canonicalRowBytes(table, value); // enforce the same size cap as encryption input
  return contentHash(encodeShortKeys(table, value));
}
