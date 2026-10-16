import type { KeyAccessIdentity } from '@/src/services/backup/keyHierarchyRecords';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import type { WorkplaceId } from '@/src/types/ids';
import { buildBackupCommit } from './buildCommit';
import { createBackupZip } from './backupFile';
import { restoreBackup, type RestoreBackupAccess } from './restoreBackup';

export async function createEncryptedBackupZip(
  identity: KeyAccessIdentity,
  workplaceId: WorkplaceId,
): Promise<Uint8Array> {
  const commit = await buildBackupCommit(identity, workplaceId);
  const workplaceKeys = await localKeyHierarchy.exportWorkplaceKeys(identity, workplaceId);
  const userRecoveryPackage = await localKeyHierarchy.exportUserRecoveryPackage(
    identity.userId,
    identity.registeredDeviceId,
  );
  return createBackupZip(commit, workplaceKeys, userRecoveryPackage);
}

export async function restoreEncryptedBackupZip(zipBytes: Uint8Array, access: RestoreBackupAccess) {
  return restoreBackup(zipBytes, access);
}
