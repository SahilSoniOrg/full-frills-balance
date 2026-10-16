import { parseObject, assertAllowedKeys, assertExactKeys } from '@/src/utils/strictObject';
import { parseUserPublicIdentity, type UserPublicIdentity } from './userIdentity';
import { parseKeyEnvelope, type KeyEnvelope } from './keyEnvelopes';
import { keyBytes } from './keyEncoding';

export interface KeyAccessIdentity {
  userId: string;
  registeredDeviceId: string;
  userKeyFingerprint: string;
}
export interface UserRecoveryPackage {
  format: 'full-frills-user-recovery';
  formatVersion: 1;
  userId: string;
  publicIdentity: UserPublicIdentity;
  userKeyFingerprint: string;
  recoveryPublicKey: string;
  recoveryEnvelope: KeyEnvelope;
}
export interface LocalUserKeys extends UserRecoveryPackage {
  deviceId: string;
  devicePublicKey: string;
  deviceKeyId: string;
  deviceEnvelope: KeyEnvelope;
  recoveryConfirmed: boolean;
}
export interface WorkplaceKeys {
  format: 'full-frills-workplace-keys';
  formatVersion: 1;
  userId: string;
  workplaceId: string;
  userKeyFingerprint: string;
  keyId: string;
  memberEnvelope: KeyEnvelope;
  recoveryPublicKey: string;
  recoveryEnvelope: KeyEnvelope;
  recoveryConfirmed: boolean;
}
export interface EncryptionSetupStatus {
  user: 'not-started' | 'interrupted' | 'pending' | 'ready' | 'recovery-required';
  identity?: KeyAccessIdentity;
  workplace?: 'missing' | 'interrupted' | 'pending' | 'ready' | 'recovery-required';
}
export const identityScope = (userId: string) => JSON.stringify(['identity', userId]);
export const userScope = (userId: string, deviceId: string) =>
  JSON.stringify(['user', userId, deviceId]);
export const userRecoveryScope = (userId: string, deviceId: string) =>
  JSON.stringify(['user-recovery', userId, deviceId]);
export const workplaceScope = (userId: string, workplaceId: string) =>
  JSON.stringify(['workplace', userId, workplaceId]);
export const workplaceIdentityScope = (userId: string, workplaceId: string) =>
  JSON.stringify(['workplace-identity', userId, workplaceId]);

function strings(raw: Record<string, unknown>, fields: string[]): void {
  if (fields.some(field => typeof raw[field] !== 'string' || !raw[field]))
    throw new Error('Invalid key state identity');
}
const USER_FIELDS = [
  'format',
  'formatVersion',
  'userId',
  'publicIdentity',
  'userKeyFingerprint',
  'recoveryPublicKey',
  'recoveryEnvelope',
];
const DEVICE_FIELDS = [
  'deviceId',
  'devicePublicKey',
  'deviceKeyId',
  'deviceEnvelope',
  'recoveryConfirmed',
];
export function parseUserRecoveryPackage(value: unknown): UserRecoveryPackage {
  const raw = parseObject(value, 'Invalid key state');
  strings(raw, ['userId', 'userKeyFingerprint', 'recoveryPublicKey']);
  if (raw.format !== 'full-frills-user-recovery' || raw.formatVersion !== 1)
    throw new Error('Unsupported User key format');
  const identity = parseUserPublicIdentity(raw.publicIdentity);
  if (identity.userId !== raw.userId) throw new Error('User identity scope mismatch');
  keyBytes(String(raw.recoveryPublicKey));
  parseKeyEnvelope(raw.recoveryEnvelope);
  return value as UserRecoveryPackage;
}

/** Portable recovery never includes a Device bundle, including unknown extra fields. */
export function parseExportedUserRecoveryPackage(value: unknown): UserRecoveryPackage {
  const user = parseUserRecoveryPackage(value);
  assertExactKeys(user, USER_FIELDS, 'Unexpected User recovery field');
  return user;
}
export function parseLocalUser(value: unknown): LocalUserKeys {
  parseUserRecoveryPackage(value);
  const raw = parseObject(value, 'Invalid key state');
  assertAllowedKeys(raw, [...USER_FIELDS, ...DEVICE_FIELDS], 'Unsupported key state field');
  strings(raw, ['deviceId', 'devicePublicKey', 'deviceKeyId']);
  if (typeof raw.recoveryConfirmed !== 'boolean') throw new Error('Invalid User setup state');
  keyBytes(String(raw.devicePublicKey));
  parseKeyEnvelope(raw.deviceEnvelope);
  return value as LocalUserKeys;
}
export function parseWorkplaceKeys(value: unknown): WorkplaceKeys {
  const raw = parseObject(value, 'Invalid key state');
  assertAllowedKeys(
    raw,
    [
      'format',
      'formatVersion',
      'userId',
      'workplaceId',
      'userKeyFingerprint',
      'keyId',
      'memberEnvelope',
      'recoveryPublicKey',
      'recoveryEnvelope',
      'recoveryConfirmed',
    ],
    'Unsupported key state field',
  );
  strings(raw, ['userId', 'workplaceId', 'userKeyFingerprint', 'keyId', 'recoveryPublicKey']);
  if (
    raw.format !== 'full-frills-workplace-keys' ||
    raw.formatVersion !== 1 ||
    typeof raw.recoveryConfirmed !== 'boolean'
  )
    throw new Error('Invalid Workplace key state');
  parseKeyEnvelope(raw.memberEnvelope);
  parseKeyEnvelope(raw.recoveryEnvelope);
  keyBytes(String(raw.recoveryPublicKey));
  return value as WorkplaceKeys;
}
