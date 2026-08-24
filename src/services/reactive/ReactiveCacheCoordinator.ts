import { Observable } from 'rxjs';

import { WorkplaceId } from '@/src/types/ids';
import { createDisposableReplay } from '@/src/services/reactive/disposableReplay';

export const REACTIVE_CACHE_NAMESPACES = {
  dashboard: 'reactive-data/dashboard',
  optimizedAccountList: 'reactive-data/optimized-account-list',
  accountDashboard: 'reactive-data/account-dashboard',
  aggregatedAccountBalances: 'reactive/aggregated-account-balances',
  workplaceAccounts: 'reactive/workplace-accounts',
  workplaceJournalMeta: 'reactive/workplace-journal-meta',
  workplaceActiveCount: 'reactive/workplace-active-count',
} as const;

type ReactiveCacheNamespace =
  (typeof REACTIVE_CACHE_NAMESPACES)[keyof typeof REACTIVE_CACHE_NAMESPACES];

type ReactiveCacheEntry = {
  workplaceId: WorkplaceId;
  dispose: () => void;
  observable: Observable<unknown>;
};

/**
 * Single owner for application-level reactive cache entries.
 *
 * Cache producers stay in their feature/service modules, but keyed streams,
 * workplace scoping, and disposal are owned here so invalidation cannot drift
 * across independent maps.
 */
class ReactiveCacheCoordinator {
  private readonly entries = new Map<string, ReactiveCacheEntry>();

  getOrCreate<T>(options: {
    namespace: ReactiveCacheNamespace;
    key: string;
    workplaceId: WorkplaceId;
    createSource: () => Observable<T>;
    decorate?: (observable: Observable<T>) => Observable<T>;
  }): Observable<T> {
    const cacheKey = `${options.namespace}:${options.key}`;
    const existing = this.entries.get(cacheKey);
    if (existing) return existing.observable as Observable<T>;

    const replay = createDisposableReplay(options.createSource());
    const observable = options.decorate ? options.decorate(replay.observable) : replay.observable;
    this.entries.set(cacheKey, {
      workplaceId: options.workplaceId,
      dispose: replay.dispose,
      observable,
    });
    return observable;
  }

  hasNamespace(namespace: ReactiveCacheNamespace): boolean {
    for (const key of this.entries.keys()) {
      if (key.startsWith(`${namespace}:`)) return true;
    }
    return false;
  }

  has(namespace: ReactiveCacheNamespace, key: string): boolean {
    return this.entries.has(`${namespace}:${key}`);
  }

  clearNamespace(namespace: ReactiveCacheNamespace, workplaceId?: WorkplaceId): void {
    this.clearNamespaces([namespace], workplaceId);
  }

  clearNamespaces(namespaces: readonly ReactiveCacheNamespace[], workplaceId?: WorkplaceId): void {
    const namespaceSet = new Set(namespaces);
    for (const [key, entry] of this.entries) {
      const namespace = key.slice(0, key.indexOf(':')) as ReactiveCacheNamespace;
      if (!namespaceSet.has(namespace)) continue;
      if (workplaceId !== undefined && entry.workplaceId !== workplaceId) continue;

      entry.dispose();
      this.entries.delete(key);
    }
  }

  clearAll(workplaceId?: WorkplaceId): void {
    for (const [key, entry] of this.entries) {
      if (workplaceId !== undefined && entry.workplaceId !== workplaceId) continue;

      entry.dispose();
      this.entries.delete(key);
    }
  }

  /** Bust all streams whose inputs change when an account is archived/restored. */
  invalidateAccountArchiveCaches(): void {
    this.clearNamespaces([
      REACTIVE_CACHE_NAMESPACES.dashboard,
      REACTIVE_CACHE_NAMESPACES.optimizedAccountList,
      REACTIVE_CACHE_NAMESPACES.accountDashboard,
      REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances,
      REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
      REACTIVE_CACHE_NAMESPACES.workplaceJournalMeta,
    ]);
  }
}

export const reactiveCacheCoordinator = new ReactiveCacheCoordinator();
