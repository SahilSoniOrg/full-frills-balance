import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { sharingService } from '@/src/services/SharingService';
import { preferences } from '@/src/services/preferences';
import { ShareFormat } from '@/src/types/sharing';
import { exportWorkplacesToJSON } from './nativeBackupExporter';
import type { WorkplaceId } from '@/src/types/ids';

export type BackupScope = 'active' | 'all' | 'selected';

/** Creates the safety backup used by the update gate. It includes every workplace by default. */
export async function exportUpdateBackup(
  scope: BackupScope = 'all',
  selectedWorkplaceIds: readonly WorkplaceId[] = [],
  onProgress?: (message: string, progress: number) => void,
): Promise<void> {
  await preferences.loadPreferences();
  const workplaces = await workplaceRepository.findAll();
  const activeId = preferences.device.activeWorkplaceId;
  const fallbackId = activeId ?? workplaces[0]?.id;
  const ids: readonly WorkplaceId[] =
    scope === 'all'
      ? workplaces.map(workplace => workplace.id)
      : scope === 'selected'
        ? selectedWorkplaceIds
        : fallbackId
          ? [fallbackId]
          : [];
  const base64Data = await exportWorkplacesToJSON(
    ids,
    scope === 'all' ? 'all' : 'selected',
    onProgress,
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await sharingService.save(
    {
      id: 'mandatory-update-backup',
      title: 'Full Frills Balance Backup',
      filename: `full-frills-backup-${timestamp}`,
      mimeType: 'application/zip',
      fileExtension: 'zip',
      getContent: () => base64Data,
    },
    ShareFormat.ZIP,
    onProgress,
  );
}
