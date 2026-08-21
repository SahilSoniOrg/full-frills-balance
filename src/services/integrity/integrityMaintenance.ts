/**
 * Destructive database / workplace maintenance (factory reset, purge, cleanup).
 * Kept separate from balance verification in IntegrityService.
 */

import { AppConfig } from '@/src/constants/app-config';
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { smsService } from '@/src/services/sms-service';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { WORKPLACE_SCOPED_TABLE_NAMES } from '@/src/services/workplace/workplaceDataTables';
import { preferences } from '@/src/utils/preferences';

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
