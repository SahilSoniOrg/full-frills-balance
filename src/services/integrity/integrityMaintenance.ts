/**
 * Destructive database / workplace maintenance (factory reset, purge, cleanup).
 * Kept separate from balance verification in IntegrityService.
 */

import { AppConfig } from '@/src/constants/app-config';
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { smsService } from '@/src/services/sms-service';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { WORKPLACE_SCOPED_TABLE_NAMES } from '@/src/services/workplace/workplaceDataTables';
import { preferences } from '@/src/services/preferences';
import { storage } from '@/src/utils/storage';
import { claimedRestoreFingerprint } from '@/src/services/import/restoreOwnership';
import { restorePublicationClaims } from '@/src/services/import/restorePublicationClaims';

const RESETTABLE_DRAFT_KEYS = [
  'onboarding_resume_state_v1',
  'onboarding_draft_v1',
  'import_resume_state_v1',
  'import_draft_v1',
] as const;

export async function resetWorkplace(
  workplaceId: WorkplaceId,
  keepWorkplaceRecord: boolean = false,
): Promise<void> {
  logger.warn(`[IntegrityMaintenance] CLEARING DATA FOR WORKPLACE: ${workplaceId}`);
  try {
    await databaseRepository.purgeWorkplaceData(workplaceId, [...WORKPLACE_SCOPED_TABLE_NAMES]);

    if (!keepWorkplaceRecord) {
      await workplaceRepository.destroyPermanently(workplaceId);
      logger.info(`[IntegrityMaintenance] Workplace ${workplaceId} reset and deletion successful.`);
    } else {
      logger.info(`[IntegrityMaintenance] Workplace ${workplaceId} data reset (shell preserved).`);
    }
  } catch (error) {
    logger.error(`[IntegrityMaintenance] Failed to reset workplace ${workplaceId}:`, error);
    throw error;
  }
}

export async function resetDatabase(): Promise<void> {
  logger.warn('[IntegrityMaintenance] STARTING FACTORY RESET...');
  try {
    await databaseRepository.resetDatabase();
    await smsService.clearProcessedMessages();
    preferences.clearPreferences();
    RESETTABLE_DRAFT_KEYS.forEach(key => storage.remove(key));
    logger.info('[IntegrityMaintenance] Database reset successful.');
  } catch (error) {
    logger.error('[IntegrityMaintenance] CRITICAL: Factory reset failed:', error);
    throw error;
  }
}

export async function cleanupDatabase(): Promise<{ deletedCount: number }> {
  logger.info('[IntegrityMaintenance] Starting database cleanup...');
  try {
    const totalDeleted = await databaseRepository.cleanupDeletedRecords([
      ...AppConfig.strings.audit.tables,
    ]);
    logger.info(`[IntegrityMaintenance] Cleanup complete. Removed ${totalDeleted} records.`);
    return { deletedCount: totalDeleted };
  } catch (error) {
    logger.error('[IntegrityMaintenance] Cleanup failed:', error);
    throw error;
  }
}

/**
 * Sweeps unaccepted ghost restore workplaces created during incomplete or abandoned
 * restore operations, ensuring orphaned records never linger in SQLite.
 */
export async function cleanupGhostWorkplaces(): Promise<{ cleanedCount: number }> {
  try {
    const allWorkplaces = await workplaceRepository.findAll();
    if (allWorkplaces.length === 0) return { cleanedCount: 0 };

    const activeWorkplaceId = preferences.device.activeWorkplaceId;
    const draftRaw = storage.getString('setup_draft_v1');
    let draftOperationId: string | undefined;
    if (draftRaw) {
      try {
        const parsed = JSON.parse(draftRaw);
        if (parsed && typeof parsed.operationId === 'string') {
          draftOperationId = parsed.operationId;
        }
      } catch {
        // ignore parse error
      }
    }

    let cleanedCount = 0;

    for (const workplace of allWorkplaces) {
      if (workplace.id === activeWorkplaceId) continue;
      if (workplace.id === draftOperationId) continue;

      const hasRestoreClaim = Boolean(claimedRestoreFingerprint(workplace.id));
      if (hasRestoreClaim) {
        logger.warn(
          `[IntegrityMaintenance] Cleaning up unaccepted ghost restore workplace: ${workplace.id}`,
        );
        await resetWorkplace(workplace.id);
        restorePublicationClaims.release(workplace.id);
        cleanedCount++;
      }
    }

    return { cleanedCount };
  } catch (error) {
    logger.error('[IntegrityMaintenance] Ghost workplace cleanup failed:', error);
    return { cleanedCount: 0 };
  }
}
