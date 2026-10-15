import {
  parseObject,
  assertAllowedKeys,
  assertExactKeys,
  isSha256Id,
  isHexId,
} from '@/src/utils/strictObject';
import { keyBytes } from './keyEncoding';
import { keyFingerprint } from './fingerprints';

const SUITE = 'HPKE-X25519-HKDF-SHA256-AES256GCM' as const;

export interface EnvelopeContext {
  purpose: 'device-user-bundle' | 'user-workplace-dek' | 'user-recovery' | 'workplace-dump';
  userId: string;
  recipientKeyId: string;
  deviceId?: string;
  workplaceId?: string;
  keyId?: string;
}
export interface KeyEnvelope {
  format: 'full-frills-key-envelope';
  formatVersion: 1;
  suite: typeof SUITE;
  context: EnvelopeContext;
  encapsulatedKey: string;
  ciphertext: string;
}

export async function publicKeyId(publicKey: string): Promise<string> {
  return keyFingerprint(keyBytes(publicKey));
}

export function parseKeyEnvelope(value: unknown): KeyEnvelope {
  const raw = parseObject(value, 'Invalid key envelope');
  assertAllowedKeys(
    raw,
    ['format', 'formatVersion', 'suite', 'context', 'encapsulatedKey', 'ciphertext'],
    'Invalid key envelope',
  );
  if (
    raw.format !== 'full-frills-key-envelope' ||
    raw.formatVersion !== 1 ||
    raw.suite !== SUITE ||
    typeof raw.encapsulatedKey !== 'string' ||
    typeof raw.ciphertext !== 'string'
  )
    throw new Error('Invalid key envelope');
  const context = parseObject(raw.context, 'Invalid key envelope');
  assertAllowedKeys(
    context,
    ['purpose', 'userId', 'recipientKeyId', 'deviceId', 'workplaceId', 'keyId'],
    'Invalid key envelope context',
  );
  if (
    !['device-user-bundle', 'user-workplace-dek', 'user-recovery', 'workplace-dump'].includes(
      String(context.purpose),
    ) ||
    typeof context.userId !== 'string' ||
    !context.userId ||
    !isSha256Id(context.recipientKeyId) ||
    ['deviceId', 'workplaceId', 'keyId'].some(
      key => context[key] !== undefined && typeof context[key] !== 'string',
    )
  )
    throw new Error('Invalid key envelope context');
  keyBytes(raw.encapsulatedKey);
  return value as KeyEnvelope;
}

export interface RecoveryCredential {
  format: 'full-frills-recovery-handle';
  formatVersion: 1;
  purpose: 'user-recovery' | 'workplace-dump';
  identityId: string;
  identityKeyId: string;
  recoveryKeyId: string;
  handle: string;
}

export function parseRecoveryCredential(value: unknown): RecoveryCredential {
  const raw = parseObject(value, 'Invalid recovery file');
  assertExactKeys(
    raw,
    [
      'format',
      'formatVersion',
      'handle',
      'identityId',
      'identityKeyId',
      'purpose',
      'recoveryKeyId',
    ],
    'Invalid recovery file',
  );
  if (
    raw.format !== 'full-frills-recovery-handle' ||
    raw.formatVersion !== 1 ||
    !['user-recovery', 'workplace-dump'].includes(String(raw.purpose)) ||
    typeof raw.identityId !== 'string' ||
    !raw.identityId.trim() ||
    !isSha256Id(raw.identityKeyId) ||
    !isSha256Id(raw.recoveryKeyId) ||
    !isHexId(raw.handle, 64)
  )
    throw new Error('Invalid recovery file');
  return value as RecoveryCredential;
}
