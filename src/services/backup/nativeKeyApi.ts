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

/** The transport remains internal to platform/test adapters; callers use these operations. */
export function keyOperationsFromTransport(
  call: (operation: string, request: unknown) => Promise<unknown>,
): Pick<
  NativeKeyOperations,
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
