import type { RecoveryCredential } from './keyEnvelopes';

export function parseRecoveryCredential(value: unknown): RecoveryCredential {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid recovery file');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).sort().join(',') !==
      'format,formatVersion,handle,identityId,identityKeyId,purpose,recoveryKeyId' ||
    raw.format !== 'full-frills-recovery-handle' ||
    raw.formatVersion !== 1 ||
    !['user-recovery', 'workplace-dump'].includes(String(raw.purpose)) ||
    typeof raw.identityId !== 'string' ||
    !raw.identityId.trim() ||
    typeof raw.identityKeyId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(raw.identityKeyId) ||
    typeof raw.recoveryKeyId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(raw.recoveryKeyId) ||
    typeof raw.handle !== 'string' ||
    !/^[a-f0-9]{64}$/.test(raw.handle)
  )
    throw new Error('Invalid recovery file');
  return value as RecoveryCredential;
}
