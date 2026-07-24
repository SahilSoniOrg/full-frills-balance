import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { WorkplaceId } from '@/src/types/domain';
import { Observable, shareReplay } from 'rxjs';

const accountsObsCache = new Map<WorkplaceId, Observable<Account[]>>();
const journalMetaObsCache = new Map<WorkplaceId, Observable<Journal[]>>();
const activeCountObsCache = new Map<WorkplaceId, Observable<number>>();

export function clearReactiveWorkplaceObservesCache(): void {
  accountsObsCache.clear();
  journalMetaObsCache.clear();
  activeCountObsCache.clear();
}

export function clearReactiveWorkplaceAccountsAndJournalMetaCache(): void {
  accountsObsCache.clear();
  journalMetaObsCache.clear();
}

export function observeWorkplaceAccounts(workplaceId: WorkplaceId): Observable<Account[]> {
  if (accountsObsCache.has(workplaceId)) {
    return accountsObsCache.get(workplaceId)!;
  }
  const obs$ = accountRepository
    .observeAll(workplaceId)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  accountsObsCache.set(workplaceId, obs$);
  return obs$;
}

export function observeWorkplaceJournalMeta(workplaceId: WorkplaceId): Observable<Journal[]> {
  if (journalMetaObsCache.has(workplaceId)) {
    return journalMetaObsCache.get(workplaceId)!;
  }
  const obs$ = journalRepository
    .observeStatusMeta(workplaceId)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  journalMetaObsCache.set(workplaceId, obs$);
  return obs$;
}

export function observeWorkplaceActiveTransactionCount(
  workplaceId: WorkplaceId,
): Observable<number> {
  if (activeCountObsCache.has(workplaceId)) {
    return activeCountObsCache.get(workplaceId)!;
  }
  const obs$ = transactionRepository
    .observeActiveCount(workplaceId)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  activeCountObsCache.set(workplaceId, obs$);
  return obs$;
}
