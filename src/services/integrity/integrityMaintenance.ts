/**
 * Destructive database / workplace maintenance (factory reset, purge, cleanup).
 * Kept separate from balance verification in IntegrityService.
 */

import { AppConfig } from '@/src/constants/app-config';
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { smsService } from '@/src/services/sms-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

/** Tables keyed by workplace_id; used for purge and staged-import swap. */
export const WORKPLACE_SCOPED_TABLES = [
  'accounts',
  'journals',
  'transactions',
  'audit_logs',
  'budgets',
  'budget_scopes',
  'account_metadata',
  'planned_payments',
  'journal_metadata',
  'transaction_auto_post_rules',
  'transaction_inbox_records',
  'balance_snapshots',
] as const;

export async function resetWorkplace(
  workplaceId: WorkplaceId,
  keepWorkplaceRecord: boolean = false,
): Promise<void> {
  logger.warn(`[IntegrityMaintenance] CLEARING DATA FOR WORKPLACE: ${workplaceId}`);
  try {
    await databaseRepository.purgeWorkplaceData(workplaceId, [...WORKPLACE_SCOPED_TABLES]);

    if (!keepWorkplaceRecord) {
      const { database } = await import('@/src/data/database/Database');
      await database.write(async () => {
        const workplace = await workplaceService.getWorkplace(workplaceId);
        if (workplace) {
          await workplace.destroyPermanently();
        }
      });
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
