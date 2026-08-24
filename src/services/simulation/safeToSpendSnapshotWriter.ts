import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { snapshotService } from '@/src/utils/SnapshotService';

/**
 * Persists a successful Safe-to-Spend projection for offline/widget use.
 * Failures are logged and swallowed so persistence never alters pipeline output.
 */
export function persistSafeToSpendSnapshot(
  workplaceId: WorkplaceId,
  dashboard: SafeToSpendDashboard,
): void {
  try {
    snapshotService.saveCustomSnapshot(workplaceId, 'safe_to_spend', dashboard);
  } catch (error) {
    logger.warn('[SafeToSpendReadModel] Failed to save snapshot', { error });
  }
}
