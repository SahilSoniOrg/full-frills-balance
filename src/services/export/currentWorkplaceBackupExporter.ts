import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';
import { sharingService } from '@/src/services/SharingService';
import { preferences } from '@/src/services/preferences';
import { ShareFormat } from '@/src/types/sharing';
import { exportToJSON, exportWorkplacesToJSON } from './nativeBackupExporter';
import type { WorkplaceId } from '@/src/types/ids';

export type BackupScope = 'active' | 'all' | 'selected';

/** Creates a user-saveable backup without requiring WorkplaceProvider. */
export async function exportCurrentWorkplaceBackup(
  onProgress?: (message: string, progress: number) => void,
): Promise<void> {
  await preferences.loadPreferences();
  const workplaces = await database.collections.get<Workplace>('workplaces').query().fetch();
  const activeId = preferences.device.activeWorkplaceId;
  const workplace = workplaces.find(item => item.id === activeId) ?? workplaces[0];
  if (!workplace) throw new Error('No workplace is available to export');

  const base64Data = await exportToJSON(workplace.id, onProgress);
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

/** Creates the safety backup used by the update gate. It includes every workplace by default. */
export async function exportUpdateBackup(
  scope: BackupScope = 'all',
  selectedWorkplaceIds: readonly WorkplaceId[] = [],
  onProgress?: (message: string, progress: number) => void,
): Promise<void> {
  await preferences.loadPreferences();
  const workplaces = await database.collections.get<Workplace>('workplaces').query().fetch();
  const activeId = preferences.device.activeWorkplaceId;
  const ids =
    scope === 'all'
      ? workplaces.map(workplace => workplace.id as WorkplaceId)
      : scope === 'selected'
        ? selectedWorkplaceIds
        : ([activeId ?? workplaces[0]?.id].filter(Boolean) as WorkplaceId[]);
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
