import { parseObject, assertExactKeys, isSha256Id, isHexId } from '@/src/utils/strictObject';
import type { RecoveryCredential } from './keyEnvelopes';

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
