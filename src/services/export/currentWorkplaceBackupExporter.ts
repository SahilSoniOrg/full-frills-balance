import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';
import { sharingService } from '@/src/services/SharingService';
import { preferences } from '@/src/services/preferences';
import { ShareFormat } from '@/src/types/sharing';
import { exportToJSON } from './nativeBackupExporter';

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
