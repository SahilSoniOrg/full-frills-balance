import { keyBytes } from './keyEncoding';
import { keyFingerprint } from './encryptedSnapshot';

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
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid key envelope');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      key =>
        !['format', 'formatVersion', 'suite', 'context', 'encapsulatedKey', 'ciphertext'].includes(
          key,
        ),
    ) ||
    raw.format !== 'full-frills-key-envelope' ||
    raw.formatVersion !== 1 ||
    raw.suite !== SUITE ||
    typeof raw.encapsulatedKey !== 'string' ||
    typeof raw.ciphertext !== 'string' ||
    !raw.context ||
    typeof raw.context !== 'object' ||
    Array.isArray(raw.context)
  )
    throw new Error('Invalid key envelope');
  const context = raw.context as Record<string, unknown>;
  if (
    Object.keys(context).some(
      key =>
        !['purpose', 'userId', 'recipientKeyId', 'deviceId', 'workplaceId', 'keyId'].includes(key),
    ) ||
    !['device-user-bundle', 'user-workplace-dek', 'user-recovery', 'workplace-dump'].includes(
      String(context.purpose),
    ) ||
    typeof context.userId !== 'string' ||
    !context.userId ||
    typeof context.recipientKeyId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(context.recipientKeyId) ||
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
