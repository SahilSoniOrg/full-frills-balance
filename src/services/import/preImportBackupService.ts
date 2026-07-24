import { Q } from '@nozbe/watermelondb';

import { database } from '@/src/data/database/Database';
import { exportService } from '@/src/services/export-service';
import { WorkplaceId } from '@/src/types/domain';
import { files } from '@/src/utils/files';
import { logger } from '@/src/utils/logger';

const PRE_IMPORT_BACKUP_DIR = 'pre-import-backups';

export type PreImportBackupResult =
  | { skipped: true; reason: 'empty_workplace' }
  | { path: string };

export class PreImportBackupService {
  async workplaceHasData(workplaceId: WorkplaceId): Promise<boolean> {
    const accountCount = await database.collections
      .get('accounts')
      .query(Q.where('workplace_id', workplaceId))
      .fetchCount();

    if (accountCount > 0) {
      return true;
    }

    const journalCount = await database.collections
      .get('journals')
      .query(Q.where('workplace_id', workplaceId))
      .fetchCount();

    return journalCount > 0;
  }

  buildBackupFilename(workplaceId: WorkplaceId): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeId = workplaceId.replace(/[^a-z0-9-_]/gi, '-').slice(0, 24);
    return `pre-import-${safeId}-${timestamp}.zip`;
  }

  buildBackupDirectoryUri(): string {
    const sanitizedBase = files.document.endsWith('/')
      ? files.document.slice(0, -1)
      : files.document;
    return `${sanitizedBase}/${PRE_IMPORT_BACKUP_DIR}`;
  }

  /**
   * Writes a full workplace export to app document storage before import wipe.
   * Skips when the workplace has no accounts or journals. Throws on export/write failure.
   */
  async createBackup(
    workplaceId: WorkplaceId,
    onProgress?: (message: string, progress: number) => void,
  ): Promise<PreImportBackupResult> {
    const hasData = await this.workplaceHasData(workplaceId);
    if (!hasData) {
      logger.info('[PreImportBackup] Skipping backup — workplace has no accounts or journals');
      return { skipped: true, reason: 'empty_workplace' };
    }

    onProgress?.('Creating safety backup before import...', 0);

    const zipBase64 = await exportService.exportToJSON(workplaceId, (message, progress) =>
      onProgress?.(message, progress * 0.85),
    );

    onProgress?.('Saving backup to device storage...', 0.9);

    const dirUri = this.buildBackupDirectoryUri();
    await files.ensureDirectory(dirUri);

    const filename = this.buildBackupFilename(workplaceId);
    const fileUri = `${dirUri}/${filename}`;
    await files.writeContent(fileUri, zipBase64, 'base64');

    onProgress?.(`Safety backup saved: ${fileUri}`, 1);
    logger.info('[PreImportBackup] Pre-import backup written', { path: fileUri });

    return { path: fileUri };
  }
}

export const preImportBackupService = new PreImportBackupService();
