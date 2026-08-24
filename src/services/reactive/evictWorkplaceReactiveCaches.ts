import { insightService } from '@/src/services/insight/InsightService';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

/**
 * Disposes shared Rx pipelines owned by the departing workplace so a switch
 * cannot leave its SQL streams or timers alive.
 */
export function evictWorkplaceReactiveCaches(switchInfo?: {
  from: WorkplaceId;
  to: WorkplaceId;
}): void {
  const departingWorkplaceId = switchInfo?.from;
  reactiveDataService.clearCache(departingWorkplaceId);
  safeToSpendReadModel.clearCache();
  insightService.clearCache(departingWorkplaceId);
  if (switchInfo) {
    logger.info('[ReactiveCache] Evicted caches on workplace switch', switchInfo);
  }
}
