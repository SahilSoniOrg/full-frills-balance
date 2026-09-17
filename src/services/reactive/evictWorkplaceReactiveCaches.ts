import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';
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
  reactiveCacheCoordinator.clearAll(departingWorkplaceId);
  if (switchInfo) {
    logger.info('[ReactiveCache] Evicted caches on workplace switch', switchInfo);
  }
}
