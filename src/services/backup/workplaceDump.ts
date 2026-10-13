import { decryptWorkplaceSnapshot, type EncryptedSnapshot } from './encryptedSnapshot';
import { openRecoveryEnvelope, type RecoveryCredential, type KeyEnvelope } from './keyEnvelopes';
import { publicKeyId } from './keyEnvelopes';
import { keyFingerprint } from './encryptedSnapshot';
import type { WorkplaceKeys } from './localKeyHierarchy';
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

/** Ciphertext-only dump for a future download/support API. It conveys no User or owner authority. */
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
  const dek = await openRecoveryEnvelope(
    credential,
    dump.recoveryEnvelope,
    {
      purpose: 'workplace-dump',
      userId: dump.ownerUserId,
      workplaceId: dump.workplaceId,
      keyId: dump.keyId,
      recipientKeyId: await publicKeyId(dump.recoveryPublicKey),
    },
    dump.workplaceId,
    dump.keyId,
  );
  try {
    if ((await keyFingerprint(dek)) !== dump.keyId) throw new Error('Workplace dump DEK mismatch');
    const snapshot = await decryptWorkplaceSnapshot(dump.snapshot, dek);
    if (snapshot.workplace.id !== dump.workplaceId)
      throw new Error('Workplace dump identity mismatch');
    return snapshot;
  } finally {
    dek.fill(0);
  }
}
