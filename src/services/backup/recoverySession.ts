import { KeyOperationError } from '@/src/utils/keyOperationError';
import type { EncryptionSetupSession } from './encryptionSetupStore';
import type { EncryptionSetupStatus, WorkplaceKeys } from './keyHierarchyRecords';
import type { RecoveryCredential } from './keyEnvelopes';

/** Plans public progress only; observing keys and saving the checkpoint belong to the caller. */
export function resolveRecoverySession({
  session,
  existing,
  credential,
  workplaceKeys: { workplaceId, keyId },
  deviceId,
}: {
  session: EncryptionSetupSession | null;
  existing: EncryptionSetupStatus | null;
  credential: Pick<RecoveryCredential, 'identityId' | 'identityKeyId'>;
  workplaceKeys: Pick<WorkplaceKeys, 'workplaceId' | 'keyId'>;
  deviceId: string;
}): { session: EncryptionSetupSession; preserveExistingBooks: boolean } {
  const binding = session?.verifiedWorkplaces?.find(item => item.workplaceId === workplaceId);
  if (binding && binding.keyId !== keyId)
    throw new KeyOperationError('FFB_KEY_IDENTITY_MISMATCH', 'Existing Workplace key differs');
  const pending = session?.pendingRecoveries ?? [];
  const previous = pending.find(item => item.workplaceId === workplaceId);
  if (previous && previous.keyId !== keyId)
    throw new KeyOperationError(
      'FFB_KEY_IDENTITY_MISMATCH',
      'Pending recovery belongs to a different Workplace key',
    );
  // Only this Workplace's completed binding grants preservation authority.
  // An old pending decision cannot promote an unbound imported key either.
  const preserveExistingBooks = !!binding && previous?.preserveExistingBooks !== false;
  if (existing?.identity && existing.identity.userKeyFingerprint !== credential.identityKeyId)
    throw new KeyOperationError('FFB_KEY_IDENTITY_MISMATCH', 'Established User identity mismatch');
  const next: EncryptionSetupSession = {
    ...session,
    formatVersion: 1,
    intent: 'recover-user',
    userId: credential.identityId,
    deviceId,
    userKeyFingerprint: credential.identityKeyId,
    pendingRecoveries: [
      ...pending.filter(item => item.workplaceId !== workplaceId),
      { workplaceId, keyId, preserveExistingBooks },
    ],
  };
  // Drop the unfinished export reference; storage prunes its file without reclaiming usage.
  if (next.package && !next.package.confirmed) delete next.package;
  return { session: next, preserveExistingBooks };
}

/** A completed verification/publication establishes exactly one Workplace binding. */
export function completeWorkplaceRecovery(
  session: EncryptionSetupSession,
  workplaceId: string,
  keyId: string,
): EncryptionSetupSession {
  const bindings = session.verifiedWorkplaces ?? [];
  const existing = bindings.find(item => item.workplaceId === workplaceId);
  if (existing && existing.keyId !== keyId)
    throw new KeyOperationError('FFB_KEY_IDENTITY_MISMATCH', 'Existing Workplace key differs');
  const next = {
    ...session,
    enrolledWorkplaces: [...new Set([...(session.enrolledWorkplaces ?? []), workplaceId])],
    verifiedWorkplaces: existing ? bindings : [...bindings, { workplaceId, keyId }],
  };
  const remaining = next.pendingRecoveries?.filter(item => item.workplaceId !== workplaceId);
  if (remaining?.length) next.pendingRecoveries = remaining;
  else delete next.pendingRecoveries;
  return next;
}
