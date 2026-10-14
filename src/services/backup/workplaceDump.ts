import type { EncryptedSnapshot } from './encryptedSnapshot';
import { nativeKeyOperations } from './nativeKeyOperations';
import { decodeWorkplaceSnapshot } from './workplaceSnapshot';
import type { RecoveryCredential, KeyEnvelope } from './keyEnvelopes';
import type { WorkplaceKeys } from './keyHierarchyRecords';
import type { WorkplaceSnapshot } from './workplaceSnapshot';

export interface WorkplaceDump {
  format: 'full-frills-workplace-dump';
  formatVersion: 1;
  workplaceId: string;
  ownerUserId: string;
  keyId: string;
  recoveryPublicKey: string;
  recoveryEnvelope: KeyEnvelope;
  snapshot: EncryptedSnapshot;
}

/** Local V1 dump contract verifies the independently saved Workplace credential.
 * Hosted download/support is deferred. This conveys no User or owner authority.
 */
export function createWorkplaceDump(
  keys: WorkplaceKeys,
  snapshot: EncryptedSnapshot,
): WorkplaceDump {
  if (
    !keys.recoveryConfirmed ||
    snapshot.workplaceId !== keys.workplaceId ||
    snapshot.keyId !== keys.keyId
  )
    throw new Error('Workplace dump key or identity mismatch');
  return {
    format: 'full-frills-workplace-dump',
    formatVersion: 1,
    workplaceId: keys.workplaceId,
    ownerUserId: keys.userId,
    keyId: keys.keyId,
    recoveryPublicKey: keys.recoveryPublicKey,
    recoveryEnvelope: keys.recoveryEnvelope,
    snapshot,
  };
}

/** Returns readable data only. Never publishes the old Workplace or changes membership/Device state. */
export async function decryptWorkplaceDump(
  value: unknown,
  credential: RecoveryCredential,
): Promise<WorkplaceSnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Workplace dump');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      key =>
        ![
          'format',
          'formatVersion',
          'workplaceId',
          'ownerUserId',
          'keyId',
          'recoveryPublicKey',
          'recoveryEnvelope',
          'snapshot',
        ].includes(key),
    ) ||
    raw.format !== 'full-frills-workplace-dump' ||
    raw.formatVersion !== 1 ||
    ['workplaceId', 'ownerUserId', 'keyId', 'recoveryPublicKey'].some(
      key => typeof raw[key] !== 'string',
    )
  )
    throw new Error('Invalid Workplace dump');
  const dump = value as WorkplaceDump;
  const plaintext = await nativeKeyOperations.recovery('decryptDump', { dump, credential });
  if (typeof plaintext !== 'string') throw new Error('Invalid native Workplace dump result');
  const snapshot = decodeWorkplaceSnapshot(plaintext);
  if (snapshot.workplace.id !== dump.workplaceId)
    throw new Error('Workplace dump identity mismatch');
  return snapshot;
}
