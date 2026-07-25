import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { WORKPLACE_SCOPED_TABLE_NAMES } from '@/src/services/workplace/workplaceDataTables';
import { integrityService } from '@/src/services/integrity-service';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

export async function createImportStagingWorkplace(
  targetWorkplaceId: WorkplaceId,
  fallbackCurrencyCode: string,
): Promise<WorkplaceId> {
  const stagingId = generateId() as WorkplaceId;
  let name = 'Import staging';
  let icon = 'briefcase';
  let defaultCurrencyCode = fallbackCurrencyCode;

  const target = await workplaceRepository.find(targetWorkplaceId);
  if (target) {
    name = `${target.name} (import staging)`;
    icon = target.icon;
    defaultCurrencyCode = target.defaultCurrencyCode;
  }

  await workplaceRepository.create({
    id: stagingId,
    name,
    icon,
    defaultCurrencyCode,
  });

  return stagingId;
}

export async function discardImportStagingWorkplace(
  stagingWorkplaceId: WorkplaceId,
): Promise<void> {
  try {
    await integrityService.resetWorkplace(stagingWorkplaceId, false);
  } catch (error) {
    logger.error(
      `[ImportStaging] Failed to discard staging workplace ${stagingWorkplaceId}:`,
      error,
    );
    throw error;
  }
}

export async function commitStagedImport(
  targetWorkplaceId: WorkplaceId,
  stagingWorkplaceId: WorkplaceId,
): Promise<void> {
  await databaseRepository.swapStagedWorkplaceInto(
    targetWorkplaceId,
    stagingWorkplaceId,
    WORKPLACE_SCOPED_TABLE_NAMES,
  );
  await discardImportStagingWorkplace(stagingWorkplaceId);
}
