import { insightService } from '@/src/services/insight/InsightService';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

/**
 * Drops shared Rx pipelines keyed by workplace/currency so a switch does not
 * keep prior workplace SQL streams alive (refCount: false caches).
 */
export function evictWorkplaceReactiveCaches(switchInfo?: {
  from: WorkplaceId;
  to: WorkplaceId;
}): void {
  reactiveDataService.clearCache();
  safeToSpendReadModel.clearCache();
  insightService.clearCache();
  if (switchInfo) {
    logger.info('[ReactiveCache] Evicted caches on workplace switch', switchInfo);
  }
}
