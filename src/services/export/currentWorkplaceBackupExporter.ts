import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { sharingService } from '@/src/services/SharingService';
import { preferences } from '@/src/services/preferences';
import { ShareFormat, type ShareOutcome } from '@/src/types/sharing';
import type { WorkplaceId } from '@/src/types/ids';
import { createBackupShareable } from '@/src/services/sharing/backupShareable';

export type BackupScope = 'active' | 'all' | 'selected';

/** Creates and saves a safety backup without depending on the Workplace React provider. */
export async function exportUpdateBackup(
  scope: BackupScope = 'all',
  selectedWorkplaceIds: readonly WorkplaceId[] = [],
  onProgress?: (message: string, progress: number) => void,
): Promise<ShareOutcome> {
  await preferences.loadPreferences();
  const workplaces = await workplaceRepository.findAll();
  const workplaceIds = [...selectedWorkplaceIds];
  let exportScope: 'all' | 'selected' = 'selected';

  if (scope === 'all') {
    workplaceIds.splice(0, workplaceIds.length, ...workplaces.map(workplace => workplace.id));
    exportScope = 'all';
  } else if (scope === 'active') {
    const activeId = preferences.device.activeWorkplaceId;
    const activeWorkplaceId = activeId ?? workplaces[0]?.id;
    workplaceIds.splice(0, workplaceIds.length, ...(activeWorkplaceId ? [activeWorkplaceId] : []));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const source = createBackupShareable({
    id: 'mandatory-update-backup',
    title: 'Full Frills Balance Backup',
    filename: `full-frills-backup-${timestamp}`,
    workplaceIds,
    exportScope,
  });
  return sharingService.execute(source, {
    action: 'save',
    format: ShareFormat.ZIP,
    onProgress: (message, progress) => onProgress?.(message, progress ?? 0),
  });
}
