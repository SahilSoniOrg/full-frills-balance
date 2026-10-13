import type { RecoveryCredential } from './keyEnvelopes';

export function parseRecoveryCredential(value: unknown): RecoveryCredential {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid recovery file');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).sort().join(',') !==
      (raw.format === 'full-frills-recovery-handle'
        ? 'format,formatVersion,handle,identityId,identityKeyId,purpose,recoveryKeyId'
        : 'format,formatVersion,identityId,identityKeyId,phrase,purpose,recoveryKeyId') ||
    !['full-frills-recovery-credential', 'full-frills-recovery-handle'].includes(
      String(raw.format),
    ) ||
    raw.formatVersion !== 1 ||
    !['user-recovery', 'workplace-dump'].includes(String(raw.purpose)) ||
    typeof raw.identityId !== 'string' ||
    !raw.identityId.trim() ||
    typeof raw.identityKeyId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(raw.identityKeyId) ||
    typeof raw.recoveryKeyId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(raw.recoveryKeyId) ||
    (raw.format === 'full-frills-recovery-handle'
      ? typeof raw.handle !== 'string' || !/^[a-f0-9]{64}$/.test(raw.handle)
      : typeof raw.phrase !== 'string' || !/^[a-f0-9]{76}$/i.test(raw.phrase.replace(/[\s-]/g, '')))
  )
    throw new Error('Invalid recovery file');
  return value as RecoveryCredential;
}
