import Workplace from '@/src/data/models/Workplace';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import {
  parseExportedUserRecoveryPackage,
  type KeyAccessIdentity,
} from '@/src/services/backup/keyHierarchyRecords';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import {
  assertKeyAccessAllowed,
  subscribeKeyAccessPolicy,
} from '@/src/services/backup/keyAccessPolicy';
import {
  parseRecoveryCredential,
  type RecoveryCredential,
} from '@/src/services/backup/keyEnvelopes';
import {
  userIdentityFingerprint,
  type UserPublicIdentity,
} from '@/src/services/backup/userIdentity';
import type { RestoreCompletionState } from '@/src/services/backup/restoreCompletionState';
import { countAccountsVsCategories } from '@/src/utils/accountCategory';
import type { WorkplaceId } from '@/src/types/ids';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { rowImportData } from './workplaceRowValidation';
import { readVerifiedBackup, decryptVerifiedBackup } from './verifiedBackup';

export type RestoreBackupAccess = Readonly<
  | { mode: 'existing'; identity: KeyAccessIdentity }
  | { mode: 'recovery'; credential: unknown; deviceId: string; draftId?: string }
>;

export type RestoreBackupPreview = Readonly<{
  workplace: { id: string; name: string; currency: string };
  accounts: number;
  categories: number;
  journals: number;
  transactions: number;
  budgets: number;
  plannedPayments: number;
  capturedAt?: number;
  recoveryCopy?: boolean;
}>;

export type RestoreBackupResult = Readonly<{
  status: 'ready' | 'completion-pending';
  identity: KeyAccessIdentity;
  workplace: Workplace;
  manifestHash: string;
  rowCount: number;
  warnings: readonly string[];
}>;

function assertIdentityMatchesPackage(
  identity: KeyAccessIdentity,
  userId: string,
  fingerprint: string,
): void {
  if (identity.userId !== userId || identity.userKeyFingerprint !== fingerprint)
    throw new Error('Local User identity does not match the backup recovery package');
}

async function resolveIdentity(
  userRecoveryPackageValue: unknown,
  access: RestoreBackupAccess,
): Promise<{
  identity: KeyAccessIdentity;
  publicIdentity: UserPublicIdentity;
  fingerprint: string;
}> {
  const userRecoveryPackage = parseExportedUserRecoveryPackage(userRecoveryPackageValue);
  const calculatedFingerprint = await userIdentityFingerprint(userRecoveryPackage.publicIdentity);
  if (calculatedFingerprint !== userRecoveryPackage.userKeyFingerprint)
    throw new Error('Backup User recovery package fingerprint mismatch');

  if (access.mode === 'existing') {
    assertIdentityMatchesPackage(
      access.identity,
      userRecoveryPackage.userId,
      userRecoveryPackage.userKeyFingerprint,
    );
    return {
      identity: access.identity,
      publicIdentity: userRecoveryPackage.publicIdentity,
      fingerprint: userRecoveryPackage.userKeyFingerprint,
    };
  }

  const credential: RecoveryCredential = parseRecoveryCredential(access.credential);
  if (
    credential.purpose !== 'user-recovery' ||
    credential.identityId !== userRecoveryPackage.userId ||
    credential.identityKeyId !== userRecoveryPackage.userKeyFingerprint
  )
    throw new Error('Recovery credential does not match the backup User');
  await localKeyHierarchy.validateRecoveryCredential(userRecoveryPackage, credential);
  // Recovery may have completed on an earlier attempt that failed during row validation
  // or publication. Reuse that verified Device instead of trying to enroll it again.
  const setup = await localKeyHierarchy.describeSetup(userRecoveryPackage.userId, access.deviceId);
  if (setup.user === 'ready' && setup.identity) {
    assertIdentityMatchesPackage(
      setup.identity,
      userRecoveryPackage.userId,
      userRecoveryPackage.userKeyFingerprint,
    );
    return {
      identity: setup.identity,
      publicIdentity: userRecoveryPackage.publicIdentity,
      fingerprint: userRecoveryPackage.userKeyFingerprint,
    };
  }
  const identity = await localKeyHierarchy.recoverUserDevice(
    credential,
    userRecoveryPackage,
    access.deviceId,
    access.draftId,
  );
  assertIdentityMatchesPackage(
    identity,
    userRecoveryPackage.userId,
    userRecoveryPackage.userKeyFingerprint,
  );
  return {
    identity,
    publicIdentity: userRecoveryPackage.publicIdentity,
    fingerprint: userRecoveryPackage.userKeyFingerprint,
  };
}

/**
 * Verifies, decrypts and validates a complete genesis backup before publishing any rows.
 * No server-sync index/checkpoint is read or written by this flow.
 */
export async function restoreBackup(
  zipBytes: Uint8Array,
  access: RestoreBackupAccess,
  onBeforePublish?: (preview: RestoreBackupPreview) => Promise<boolean>,
): Promise<RestoreBackupResult> {
  assertKeyAccessAllowed();
  const cancellation = new AbortController();
  const unsubscribe = subscribeKeyAccessPolicy(allowed => {
    if (!allowed) cancellation.abort();
  });
  try {
    return await restoreBackupWhileUnlocked(zipBytes, access, cancellation.signal, onBeforePublish);
  } catch (error) {
    if (cancellation.signal.aborted && error instanceof Error && error.name === 'AbortError')
      throw new KeyOperationError('FFB_KEY_CANCELLED');
    throw error;
  } finally {
    unsubscribe();
  }
}

function assertRestoreActive(signal: AbortSignal): void {
  if (signal.aborted) throw new KeyOperationError('FFB_KEY_CANCELLED');
}

async function restoreBackupWhileUnlocked(
  zipBytes: Uint8Array,
  access: RestoreBackupAccess,
  signal: AbortSignal,
  onBeforePublish?: (preview: RestoreBackupPreview) => Promise<boolean>,
): Promise<RestoreBackupResult> {
  const verified = await readVerifiedBackup(zipBytes);
  const { backup, userRecoveryPackage, verifiedManifest } = verified;
  // Do not persist a recovered User identity until the archive's manifest signature is trusted.
  assertRestoreActive(signal);
  const { identity } = await resolveIdentity(userRecoveryPackage, access);
  assertRestoreActive(signal);
  if (
    backup.workplaceKeys.userId !== identity.userId ||
    backup.workplaceKeys.userKeyFingerprint !== identity.userKeyFingerprint ||
    backup.workplaceKeys.workplaceId !== verifiedManifest.fields.workplaceId ||
    backup.workplaceKeys.keyId !== verifiedManifest.fields.keyId
  )
    throw new Error('Backup Workplace key scope mismatch');

  const { rows, metadata, manifestHash } = await decryptVerifiedBackup(
    verified,
    envelopes =>
      localKeyHierarchy.decryptRows(
        identity,
        backup.workplaceKeys.workplaceId,
        envelopes,
        backup.workplaceKeys,
      ),
    () => assertRestoreActive(signal),
  );
  const workplaceId = verifiedManifest.fields.workplaceId as WorkplaceId;
  const data = rowImportData(rows);
  validateImportedData(data);

  // Validate both installed keys and any durable identity marker before publishing rows.
  // Otherwise a failed installation could strand the committed restore receipt.
  assertRestoreActive(signal);
  await localKeyHierarchy.preflightWorkplaceRestore(identity, backup.workplaceKeys);

  assertRestoreActive(signal);
  const counts = countAccountsVsCategories(data.accounts);
  const preview: RestoreBackupPreview = {
    capturedAt: verifiedManifest.fields.createdAt,
    workplace: {
      id: workplaceId,
      name: metadata.name,
      currency: metadata.defaultCurrencyCode,
    },
    ...counts,
    journals: data.journals.length,
    transactions: data.transactions.length,
    budgets: data.budgets?.length ?? 0,
    plannedPayments: data.plannedPayments?.length ?? 0,
  };
  if (onBeforePublish && !(await onBeforePublish(preview))) {
    if (access.mode === 'recovery' && access.draftId)
      await localKeyHierarchy.discardRestoreDraft(
        identity.userId,
        identity.registeredDeviceId,
        access.draftId,
      );
    throw new KeyOperationError('FFB_KEY_CANCELLED');
  }
  assertRestoreActive(signal);
  const completion: RestoreCompletionState = {
    formatVersion: 1,
    identity,
    workplaceKeys: backup.workplaceKeys,
    manifestHash,
    rowCount: verifiedManifest.fields.rowCount,
    safeToSpendDays: metadata.safeToSpendDays as 30 | 60 | 90,
    ...(access.mode === 'recovery' && access.draftId ? { recoveryDraftId: access.draftId } : {}),
  };
  const workplace = await importRepository.batchInsertRowRestore(
    {
      id: workplaceId,
      name: metadata.name,
      icon: metadata.icon,
      defaultCurrencyCode: metadata.defaultCurrencyCode,
      rowRestoreCompletionJson: JSON.stringify(completion),
    },
    data,
    manifestHash,
    signal,
  );

  // Publication hands ownership to the durable completion service. Exact retries of a
  // completed receipt leave its current keys, preferences and financial records untouched.
  return {
    status: workplace.rowRestoreCompletionJson ? 'completion-pending' : 'ready',
    identity,
    workplace,
    manifestHash,
    rowCount: verifiedManifest.fields.rowCount,
    warnings: [],
  };
}
