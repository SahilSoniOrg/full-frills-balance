import { parseUserPublicIdentity, type UserPublicIdentity } from './userIdentity';
import {
  publicKeyId,
  parseKeyEnvelope,
  type EnvelopeContext,
  type KeyEnvelope,
} from './keyEnvelopes';
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
  writerDeviceId: string;
  encryptionInvocations: number;
}
export interface EncryptionSetupStatus {
  user: 'not-started' | 'interrupted' | 'pending' | 'ready' | 'recovery-required';
  identity?: KeyAccessIdentity;
  workplace?: 'missing' | 'interrupted' | 'pending' | 'ready' | 'recovery-required';
  writerAllowed?: boolean;
  budgetExhausted?: boolean;
}
export function recoveryManifestMessage(identity: KeyAccessIdentity, digest: string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      'full-frills-local-recovery',
      1,
      identity.userId,
      identity.userKeyFingerprint,
      digest,
    ]),
  );
}
const MAX_ENCRYPTIONS = 2 ** 20;
export const userScope = (userId: string, deviceId: string) =>
  JSON.stringify(['user', userId, deviceId]);
export const workplaceScope = (userId: string, workplaceId: string) =>
  JSON.stringify(['workplace', userId, workplaceId]);
export const workplaceIdentityScope = (userId: string, workplaceId: string) =>
  JSON.stringify(['workplace-identity', userId, workplaceId]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid key state');
  return value as Record<string, unknown>;
}
function strings(raw: Record<string, unknown>, fields: string[]): void {
  if (fields.some(field => typeof raw[field] !== 'string' || !raw[field]))
    throw new Error('Invalid key state identity');
}
function exactFields(raw: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(raw).some(key => !fields.includes(key)))
    throw new Error('Unsupported key state field');
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
  const raw = object(value);
  strings(raw, ['userId', 'userKeyFingerprint', 'recoveryPublicKey']);
  if (raw.format !== 'full-frills-user-recovery' || raw.formatVersion !== 1)
    throw new Error('Unsupported User key format');
  const identity = parseUserPublicIdentity(raw.publicIdentity);
  if (identity.userId !== raw.userId) throw new Error('User identity scope mismatch');
  keyBytes(String(raw.recoveryPublicKey));
  parseKeyEnvelope(raw.recoveryEnvelope);
  return value as UserRecoveryPackage;
}
export function parseLocalUser(value: unknown): LocalUserKeys {
  parseUserRecoveryPackage(value);
  const raw = object(value);
  exactFields(raw, [...USER_FIELDS, ...DEVICE_FIELDS]);
  strings(raw, ['deviceId', 'devicePublicKey', 'deviceKeyId']);
  if (typeof raw.recoveryConfirmed !== 'boolean') throw new Error('Invalid User setup state');
  keyBytes(String(raw.devicePublicKey));
  parseKeyEnvelope(raw.deviceEnvelope);
  return value as LocalUserKeys;
}
export function parseWorkplaceKeys(value: unknown): WorkplaceKeys {
  const raw = object(value);
  exactFields(raw, [
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
    'writerDeviceId',
    'encryptionInvocations',
  ]);
  strings(raw, [
    'userId',
    'workplaceId',
    'userKeyFingerprint',
    'keyId',
    'recoveryPublicKey',
    'writerDeviceId',
  ]);
  if (
    raw.format !== 'full-frills-workplace-keys' ||
    raw.formatVersion !== 1 ||
    typeof raw.recoveryConfirmed !== 'boolean' ||
    typeof raw.encryptionInvocations !== 'number' ||
    !Number.isSafeInteger(raw.encryptionInvocations) ||
    raw.encryptionInvocations < 0 ||
    raw.encryptionInvocations > MAX_ENCRYPTIONS
  )
    throw new Error('Invalid Workplace key state');
  parseKeyEnvelope(raw.memberEnvelope);
  parseKeyEnvelope(raw.recoveryEnvelope);
  keyBytes(String(raw.recoveryPublicKey));
  return value as WorkplaceKeys;
}

export async function workplaceRecoveryContext(keys: WorkplaceKeys): Promise<EnvelopeContext> {
  return {
    purpose: 'workplace-dump',
    userId: keys.userId,
    workplaceId: keys.workplaceId,
    keyId: keys.keyId,
    recipientKeyId: await publicKeyId(keys.recoveryPublicKey),
  };
}
