/**
 * Destructive database / workplace maintenance (factory reset, purge, cleanup).
 * Kept separate from balance verification and orchestration.
 */

import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { WORKPLACE_SCOPED_TABLE_NAMES } from '@/src/services/workplace/workplaceDataTables';
import { preferences } from '@/src/services/preferences';
import { storage } from '@/src/utils/storage';
import { claimedRestoreFingerprint } from '@/src/services/import/restoreOwnership';
import { restorePublicationClaims } from '@/src/services/import/restorePublicationClaims';
import { SETUP_DRAFT_KEY } from '@/src/services/setup/setupDraftIdentity';
import { clearLocalAuditActorId } from '@/src/services/audit-identity';
import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { snapshotService } from '@/src/utils/SnapshotService';

function runPostResetCleanup(
  warnings: string[],
  steps: { label: string; failureLog: string; run: () => void }[],
): void {
  for (const step of steps) {
    try {
      step.run();
    } catch (error) {
      logger.warn(`[IntegrityMaintenance] ${step.failureLog}`, { error });
      warnings.push(step.label);
    }
  }
}

const RESETTABLE_DRAFT_KEYS = [
  'onboarding_resume_state_v1',
  'onboarding_draft_v1',
  'import_resume_state_v1',
  'import_draft_v1',
] as const;

export async function resetWorkplace(
  workplaceId: WorkplaceId,
  keepWorkplaceRecord: boolean = false,
): Promise<{ status: 'committed' | 'committed_with_warnings'; warnings: string[] }> {
  logger.warn(`[IntegrityMaintenance] CLEARING DATA FOR WORKPLACE: ${workplaceId}`);
  try {
    if (!keepWorkplaceRecord) {
      await databaseRepository.destroyWorkplace(workplaceId, WORKPLACE_SCOPED_TABLE_NAMES);
      logger.info(`[IntegrityMaintenance] Workplace ${workplaceId} reset and deletion successful.`);
    } else {
      await databaseRepository.purgeWorkplaceData(workplaceId, [...WORKPLACE_SCOPED_TABLE_NAMES]);
      logger.info(`[IntegrityMaintenance] Workplace ${workplaceId} data reset (shell preserved).`);
    }
  } catch (error) {
    logger.error(`[IntegrityMaintenance] Failed to reset workplace ${workplaceId}:`, error);
    throw error;
  }
  const warnings: string[] = [];
  const activeWorkplaceId = preferences.device.activeWorkplaceId;
  runPostResetCleanup(warnings, [
    {
      label: 'Reactive projection cleanup',
      failureLog: 'Reactive projection cleanup failed after publication',
      run: () => reactiveCacheCoordinator.clearAll(workplaceId),
    },
    ...(keepWorkplaceRecord || activeWorkplaceId !== workplaceId
      ? []
      : [
          {
            label: 'Active Workplace pointer cleanup',
            failureLog: 'Active Workplace pointer cleanup failed after publication',
            run: () => preferences.device.setActiveWorkplaceId(undefined),
          },
        ]),
    ...(keepWorkplaceRecord
      ? []
      : [
          {
            label: 'Workplace preference cleanup',
            failureLog: 'Workplace preference cleanup failed after publication',
            run: () => preferences.workplace.clear(workplaceId),
          },
        ]),
  ]);
  if (!snapshotService.clearSnapshotsForWorkplace(workplaceId)) {
    warnings.push('Snapshot cleanup');
  }
  if (keepWorkplaceRecord) snapshotService.resumeSnapshotsForWorkplace(workplaceId);
  try {
    await widgetProjectionService.clearWorkplace(
      workplaceId,
      activeWorkplaceId === workplaceId ? workplaceId : undefined,
    );
  } catch (error) {
    logger.warn('[IntegrityMaintenance] Widget cleanup failed after publication', { error });
    warnings.push('Widget cleanup');
  }
  return { status: warnings.length ? 'committed_with_warnings' : 'committed', warnings };
}

export async function resetDatabase(): Promise<{
  status: 'committed' | 'committed_with_warnings';
  warnings: string[];
}> {
  logger.warn('[IntegrityMaintenance] STARTING FACTORY RESET...');
  try {
    await databaseRepository.resetDatabase();
  } catch (error) {
    logger.error('[IntegrityMaintenance] CRITICAL: Factory reset failed:', error);
    throw error;
  }
  const warnings: string[] = [];
  runPostResetCleanup(warnings, [
    {
      label: 'Preference cleanup',
      failureLog: 'Preference cleanup failed after factory reset',
      run: () => preferences.clearPreferences(),
    },
    {
      label: 'Audit identity cleanup',
      failureLog: 'Audit identity cleanup failed after factory reset',
      run: () => clearLocalAuditActorId(),
    },
    {
      label: 'Setup draft cleanup',
      failureLog: 'Setup draft cleanup failed after factory reset',
      run: () => {
        RESETTABLE_DRAFT_KEYS.forEach(key => storage.remove(key));
        storage.remove(SETUP_DRAFT_KEY);
        restorePublicationClaims.clearAll();
      },
    },
    {
      label: 'Reactive projection cleanup',
      failureLog: 'Reactive projection cleanup failed after factory reset',
      run: () => reactiveCacheCoordinator.clearAll(),
    },
  ]);
  if (!snapshotService.clearSnapshots()) warnings.push('Snapshot cleanup');
  try {
    await widgetProjectionService.clearAll();
  } catch (error) {
    logger.warn('[IntegrityMaintenance] Widget cleanup failed after factory reset', { error });
    warnings.push('Widget cleanup');
  }
  logger.info('[IntegrityMaintenance] Database reset committed.');
  return { status: warnings.length ? 'committed_with_warnings' : 'committed', warnings };
}

const INTEGRITY_CLEANUP_TABLES = ['journals', 'transactions', 'accounts'] as const;

export async function cleanupDatabase(): Promise<{ deletedCount: number }> {
  logger.info('[IntegrityMaintenance] Starting database cleanup...');
  try {
    const totalDeleted = await databaseRepository.cleanupDeletedRecords([
      ...INTEGRITY_CLEANUP_TABLES,
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
    const draftRaw = storage.getString(SETUP_DRAFT_KEY);
    const draftOperationIds = new Set<string>();
    if (draftRaw) {
      try {
        const parsed = JSON.parse(draftRaw);
        if (parsed && typeof parsed.operationId === 'string') {
          draftOperationIds.add(parsed.operationId);
        }
        const restore = parsed?.restore;
        const nested = restore?.source;
        const sources = Array.isArray(restore?.sources)
          ? restore.sources
          : nested
            ? [nested, ...(Array.isArray(nested.batch) ? nested.batch : [])]
            : [];
        for (const source of sources) {
          if (source && typeof source.operationId === 'string') {
            draftOperationIds.add(source.operationId);
          }
        }
      } catch {
        // ignore parse error
      }
    }

    let cleanedCount = 0;

    for (const workplace of allWorkplaces) {
      if (workplace.id === activeWorkplaceId) continue;
      if (draftOperationIds.has(workplace.id)) continue;

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
