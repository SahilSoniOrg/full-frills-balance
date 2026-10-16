import { keyHex } from './keyEncoding';
import { KEY_OPERATION_ERROR_CODES } from '@/src/utils/keyOperationError';
import { encodeUtf8 } from '@/src/services/sync/codec/tlv';
import type { RowManifestFields } from '@/src/services/sync/codec/manifestBytes';
import {
  parseRowEnvelope,
  serializeRowEnvelope,
  type RowEnvelopeJson,
} from '@/src/services/sync/codec/envelopeJson';
import {
  MAX_ROW_BATCH_BYTES,
  MAX_ROW_BATCH_COUNT,
  MAX_ROW_CIPHERTEXT_BYTES,
  MAX_ROW_PLAINTEXT_BYTES,
  type EncryptRow,
  type DecryptedRow,
} from '@/src/services/sync/rowCrypto';
import {
  parseObject,
  assertAllowedKeys,
  assertExactKeys,
  isSha256Id,
  isHexId,
} from '@/src/utils/strictObject';
import type { LocalUserKeys, WorkplaceKeys } from './keyHierarchyRecords';
import type { UserPublicIdentity } from './userIdentity';
import { parseKeyEnvelope, type KeyEnvelope } from './keyEnvelopes';

/** Ephemeral native lookup token. Contains no private bytes and is not a durable backup. */
export interface NativeKeyReference {
  format: 'full-frills-native-key-reference';
  formatVersion: 1;
  kind: 'device' | 'user' | 'workplace';
  keyId: string;
  handle: string;
  publicKey?: string; // DEKs are symmetric and have no public key.
}
export interface DeviceKeyScope {
  kind: 'device';
  userId: string;
  deviceId: string;
}
export interface DeviceKeyRecipient {
  userId: string;
  deviceId: string;
  publicKey: string;
  keyId: string;
}
export interface DeviceUserEnvelope {
  userId: string;
  userKeyFingerprint: string;
  deviceId: string;
  devicePublicKey: string;
  deviceKeyId: string;
  deviceEnvelope: KeyEnvelope;
}
export interface WorkplaceMemberEnvelope {
  workplaceId: string;
  keyId: string;
  userId: string;
  userKeyFingerprint: string;
  memberEnvelope: KeyEnvelope;
}
export type GenerateKeysRequest =
  | DeviceKeyScope
  | { kind: 'user'; device: NativeKeyReference }
  | { kind: 'workplace'; user: NativeKeyReference; workplaceId: string };
export type OpenKeyRequest =
  | { kind: 'user'; user: LocalUserKeys }
  | { kind: 'workplace'; user: NativeKeyReference; keys: WorkplaceKeys };
export type RecoveryOperation =
  'confirmUser' | 'validateRecovery' | 'recoverUser' | 'confirmWorkplace';

function base64ByteLength(text: string): number {
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.floor((text.length * 3) / 4) - padding;
}

function parseDecryptedRow(value: unknown, expected: RowEnvelopeJson): DecryptedRow {
  const row = parseObject(value, 'Invalid decrypted row');
  if (row.rowId !== expected.rowId || row.table !== expected.table)
    throw new Error('Native row scope mismatch');
  if (row.ok === false) {
    assertExactKeys(row, ['ok', 'rowId', 'table', 'error'], 'Invalid decrypted row error');
    const error = KEY_OPERATION_ERROR_CODES.find(code => code === row.error);
    if (!error) throw new Error('Unknown native row error');
    return { ok: false, rowId: expected.rowId, table: expected.table, error };
  }
  assertExactKeys(
    row,
    ['ok', 'rowId', 'table', 'schemaVersion', 'dictId', 'plaintext'],
    'Invalid decrypted row',
  );
  if (
    row.ok !== true ||
    typeof row.schemaVersion !== 'number' ||
    !Number.isSafeInteger(row.schemaVersion) ||
    row.schemaVersion < 0 ||
    typeof row.dictId !== 'string' ||
    !row.dictId.startsWith(expected.table + '/') ||
    typeof row.plaintext !== 'string' ||
    encodeUtf8(row.plaintext).length > 65536 ||
    (expected.deleted && row.plaintext !== '')
  )
    throw new Error('Invalid decrypted row');
  return {
    ok: true,
    rowId: expected.rowId,
    table: expected.table,
    schemaVersion: row.schemaVersion,
    dictId: row.dictId,
    plaintext: row.plaintext,
  };
}

/** The transport remains internal to platform/test adapters; callers use these operations. */
export function keyOperationsFromTransport(
  call: (operation: string, request: unknown) => Promise<unknown>,
): Pick<
  NativeKeyOperations,
  | 'encryptRows'
  | 'decryptRows'
  | 'signRowManifest'
  | 'generateKeys'
  | 'openKey'
  | 'hasKey'
  | 'removeKey'
  | 'releaseKey'
  | 'recovery'
  | 'wrapUserForDevice'
  | 'wrapWorkplaceForUser'
> {
  return {
    async encryptRows(key, workplaceId, keyId, rows) {
      if (key.kind !== 'workplace' || key.keyId !== keyId)
        throw new Error('Native Workplace key scope mismatch');
      if (rows.length > MAX_ROW_BATCH_COUNT) throw new Error('FFB_ROW_TOO_LARGE: batch count');
      let plaintextBytes = 0;
      for (const row of rows) {
        const bytes = encodeUtf8(row.plaintext, 'row plaintext');
        if (bytes.length > MAX_ROW_PLAINTEXT_BYTES)
          throw new Error('FFB_ROW_TOO_LARGE: row plaintext');
        plaintextBytes += bytes.length;
        if (plaintextBytes > MAX_ROW_BATCH_BYTES)
          throw new Error('FFB_ROW_TOO_LARGE: batch plaintext');
      }
      const result = parseObject(
        await call('encryptRows', { key, workplaceId, keyId, rows }),
        'Invalid encrypted rows',
      );
      assertExactKeys(result, ['envelopes'], 'Invalid encrypted rows');
      if (!Array.isArray(result.envelopes) || result.envelopes.length !== rows.length)
        throw new Error('Native row count mismatch');
      return result.envelopes.map((value, index) => {
        const row = parseRowEnvelope(value),
          expected = rows[index];
        if (
          row.workplaceId !== workplaceId ||
          row.keyId !== keyId ||
          row.table !== expected.table ||
          row.rowId !== expected.rowId ||
          row.updatedAt !== expected.updatedAt ||
          row.deleted !== expected.deleted
        )
          throw new Error('Native row scope mismatch');
        return serializeRowEnvelope(row);
      });
    },
    async decryptRows(key, workplaceId, envelopes) {
      if (key.kind !== 'workplace') throw new Error('Native Workplace key scope mismatch');
      if (envelopes.length > MAX_ROW_BATCH_COUNT) throw new Error('FFB_ROW_TOO_LARGE: batch count');
      let ciphertextBytes = 0;
      for (const envelope of envelopes) {
        if (envelope.workplaceId !== workplaceId || envelope.keyId !== key.keyId)
          throw new Error('Native Workplace key scope mismatch');
        const size = base64ByteLength(envelope.ciphertext);
        if (size > MAX_ROW_CIPHERTEXT_BYTES) throw new Error('FFB_ROW_TOO_LARGE: row ciphertext');
        ciphertextBytes += size;
        if (ciphertextBytes > MAX_ROW_BATCH_BYTES)
          throw new Error('FFB_ROW_TOO_LARGE: batch ciphertext');
      }
      // Native stops early when expanded plaintext fills its batch; resubmit the remainder.
      const decrypted: DecryptedRow[] = [];
      while (decrypted.length < envelopes.length) {
        const pending = envelopes.slice(decrypted.length);
        const result = parseObject(
          await call('decryptRows', { key, workplaceId, envelopes: pending }),
          'Invalid decrypted rows',
        );
        assertExactKeys(result, ['rows'], 'Invalid decrypted rows');
        if (
          !Array.isArray(result.rows) ||
          result.rows.length === 0 ||
          result.rows.length > pending.length
        )
          throw new Error('Native row count mismatch');
        for (const [index, value] of result.rows.entries())
          decrypted.push(parseDecryptedRow(value, pending[index]));
      }
      return decrypted;
    },
    async signRowManifest(key, fields) {
      const result = parseObject(
        await call('signRowManifest', {
          key,
          fields: { ...fields, prevHash: keyHex(fields.prevHash), root: keyHex(fields.root) },
        }),
        'Invalid manifest signature',
      );
      assertExactKeys(result, ['signature'], 'Invalid manifest signature');
      if (!isHexId(result.signature, 128)) throw new Error('Invalid manifest signature');
      return result.signature;
    },
    generateKeys: request => call('generateKeys', request),
    openKey: async request => parseNativeKeyReference(await call('openKey', request)),
    hasKey: async scope => {
      const result = await call('hasKey', scope);
      if (typeof result !== 'boolean') throw new Error('Invalid native vault result');
      return result;
    },
    removeKey: async scope => {
      await call('removeKey', scope);
    },
    releaseKey: async key => {
      await call('releaseKey', { key });
    },
    recovery: (operation, request) => call(operation, request),
    wrapUserForDevice: async (key, recipient) => {
      const result = await call('wrapUserForDevice', { key, recipient });
      const value = envelopeResult(
        result,
        ['userId', 'userKeyFingerprint', 'deviceId', 'devicePublicKey', 'deviceKeyId'],
        'deviceEnvelope',
      );
      const envelope = parseKeyEnvelope(value.deviceEnvelope);
      if (
        value.userId !== recipient.userId ||
        value.deviceId !== recipient.deviceId ||
        value.devicePublicKey !== recipient.publicKey ||
        value.deviceKeyId !== recipient.keyId ||
        value.userKeyFingerprint !== key.keyId ||
        envelope.context.purpose !== 'device-user-bundle' ||
        envelope.context.userId !== recipient.userId ||
        envelope.context.deviceId !== recipient.deviceId ||
        envelope.context.recipientKeyId !== recipient.keyId ||
        envelope.context.keyId !== key.keyId
      )
        throw new Error('Native Device envelope scope mismatch');
      return result as DeviceUserEnvelope;
    },
    wrapWorkplaceForUser: async (key, recipient, userKeyFingerprint) => {
      const result = await call('wrapWorkplaceForUser', {
        key,
        recipient,
        userKeyFingerprint,
      });
      const value = envelopeResult(
        result,
        ['workplaceId', 'keyId', 'userId', 'userKeyFingerprint'],
        'memberEnvelope',
      );
      const envelope = parseKeyEnvelope(value.memberEnvelope);
      if (
        value.userId !== recipient.userId ||
        value.userKeyFingerprint !== userKeyFingerprint ||
        value.keyId !== key.keyId ||
        envelope.context.purpose !== 'user-workplace-dek' ||
        envelope.context.userId !== recipient.userId ||
        envelope.context.workplaceId !== value.workplaceId ||
        envelope.context.keyId !== key.keyId
      )
        throw new Error('Native Workplace envelope scope mismatch');
      return result as WorkplaceMemberEnvelope;
    },
  };
}
function envelopeResult(
  value: unknown,
  strings: string[],
  envelope: string,
): Record<string, unknown> {
  const result = parseObject(value, 'Invalid native key envelope result');
  assertExactKeys(result, [...strings, envelope], 'Invalid native key envelope result');
  if (strings.some(name => typeof result[name] !== 'string' || !result[name]))
    throw new Error('Invalid native key envelope result');
  return result;
}
export function parseNativeKeyReference(value: unknown): NativeKeyReference {
  const key = parseObject(value, 'Invalid native key reference');
  assertAllowedKeys(
    key,
    ['format', 'formatVersion', 'kind', 'keyId', 'handle', 'publicKey'],
    'Invalid native key reference',
  );
  if (
    key.format !== 'full-frills-native-key-reference' ||
    key.formatVersion !== 1 ||
    !['device', 'user', 'workplace'].includes(String(key.kind)) ||
    !isSha256Id(key.keyId) ||
    !isHexId(key.handle, 64) ||
    (key.kind === 'workplace' ? key.publicKey !== undefined : !isHexId(key.publicKey, 64))
  )
    throw new Error('Invalid native key reference');
  return value as NativeKeyReference;
}

/** Key-envelope opening returns references; secret key material stays native. */
export interface NativeKeyOperations {
  encryptRows(
    key: NativeKeyReference,
    workplaceId: string,
    keyId: string,
    rows: readonly EncryptRow[],
  ): Promise<readonly RowEnvelopeJson[]>;
  decryptRows(
    key: NativeKeyReference,
    workplaceId: string,
    envelopes: readonly RowEnvelopeJson[],
  ): Promise<readonly DecryptedRow[]>;
  signRowManifest(key: NativeKeyReference, fields: RowManifestFields): Promise<string>;
  generateKeys(request: GenerateKeysRequest): Promise<unknown>;
  openKey(request: OpenKeyRequest): Promise<NativeKeyReference>;
  /** Encrypts the existing User bundle; recipient verification/approval belongs to enrollment. */
  wrapUserForDevice(
    key: NativeKeyReference,
    recipient: DeviceKeyRecipient,
  ): Promise<DeviceUserEnvelope>;
  /** Encrypts the existing DEK; this envelope alone does not grant Workplace membership. */
  wrapWorkplaceForUser(
    key: NativeKeyReference,
    recipient: UserPublicIdentity,
    userKeyFingerprint: string,
  ): Promise<WorkplaceMemberEnvelope>;
  hasKey(scope: DeviceKeyScope): Promise<boolean>;
  removeKey(scope: DeviceKeyScope): Promise<void>;
  releaseKey(key: NativeKeyReference): Promise<void>;
  recovery(operation: RecoveryOperation, request: unknown): Promise<unknown>;
  pickCredential(): Promise<unknown | null>;
  exportCredential(handle: unknown): Promise<boolean>;
  retainCredential(handle: unknown): Promise<void>;
  releaseCredential(handle: unknown): Promise<void>;
  clearCredentials(): Promise<void>;
}
