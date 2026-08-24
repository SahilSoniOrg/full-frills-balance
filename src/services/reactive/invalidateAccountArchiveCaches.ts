import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';

/** Bust stale shareReplay graphs after archive mutations. */
export function invalidateAccountArchiveCaches(): void {
  reactiveCacheCoordinator.invalidateAccountArchiveCaches();
}
