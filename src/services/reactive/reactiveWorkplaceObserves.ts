import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import { accountObserveQueries } from '@/src/data/repositories/account';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionObserveQueries } from '@/src/data/repositories/transaction';
import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';
import { WorkplaceId } from '@/src/types/ids';
import { Observable } from 'rxjs';

export function clearReactiveWorkplaceObservesCache(workplaceId?: WorkplaceId): void {
  reactiveCacheCoordinator.clearNamespaces(
    [
      REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
      REACTIVE_CACHE_NAMESPACES.workplaceJournalMeta,
      REACTIVE_CACHE_NAMESPACES.workplaceActiveCount,
    ],
    workplaceId,
  );
}

export function clearReactiveWorkplaceAccountsAndJournalMetaCache(workplaceId?: WorkplaceId): void {
  reactiveCacheCoordinator.clearNamespaces(
    [REACTIVE_CACHE_NAMESPACES.workplaceAccounts, REACTIVE_CACHE_NAMESPACES.workplaceJournalMeta],
    workplaceId,
  );
}

export function observeWorkplaceAccounts(workplaceId: WorkplaceId): Observable<Account[]> {
  return reactiveCacheCoordinator.getOrCreate({
    namespace: REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
    key: workplaceId,
    workplaceId,
    createSource: () => accountObserveQueries.observeAll(workplaceId),
  });
}

export function observeWorkplaceJournalMeta(workplaceId: WorkplaceId): Observable<Journal[]> {
  return reactiveCacheCoordinator.getOrCreate({
    namespace: REACTIVE_CACHE_NAMESPACES.workplaceJournalMeta,
    key: workplaceId,
    workplaceId,
    createSource: () => journalObserveQueries.observeStatusMeta(workplaceId),
  });
}

export function observeWorkplaceActiveTransactionCount(
  workplaceId: WorkplaceId,
): Observable<number> {
  return reactiveCacheCoordinator.getOrCreate({
    namespace: REACTIVE_CACHE_NAMESPACES.workplaceActiveCount,
    key: workplaceId,
    workplaceId,
    createSource: () => transactionObserveQueries.observeActiveCount(workplaceId),
  });
}
