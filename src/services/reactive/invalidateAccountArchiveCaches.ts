import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';
import { WorkplaceId } from '@/src/types/ids';

/** Bust stale shareReplay graphs after archive mutations. */
export function invalidateAccountArchiveCaches(workplaceId: WorkplaceId): void {
  reactiveCacheCoordinator.invalidateAccountArchiveCaches(workplaceId);
}
