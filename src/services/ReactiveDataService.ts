import { AppConfig } from '@/src/constants';
import { toPlainAccount, toPlainAccounts } from '@/src/data/models/Account';
import {
  clearReactiveAggregatedBalancesCache,
  observeAggregatedAccountBalances,
} from '@/src/services/reactive/reactiveAggregatedBalances';
import {
  clearReactiveWorkplaceObservesCache,
  clearReactiveWorkplaceAccountsAndJournalMetaCache,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { getAccountDescendants } from '@/src/services/accounts/accountDescendants';
import { observeEnrichedJournals } from '@/src/services/journal/journalTimelineReadModel';
import { WealthSummary } from '@/src/services/wealth-service';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import {
  AccountBalance,
  AccountId,
  EnrichedJournal,
  PlainAccount,
  WorkplaceId,
} from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { firstValueFrom, combineLatest, Observable, switchMap, map, tap } from 'rxjs';
import { snapshotService } from '@/src/utils/SnapshotService';
import { traceService } from '@/src/utils/TraceService';
import { createDisposableReplay, DisposableReplay } from '@/src/services/reactive/disposableReplay';

type ReactiveCacheEntry<T> = DisposableReplay<T> & { workplaceId: WorkplaceId };

/**
 * Consolidated reactive data for dashboard widgets.
 * Eliminates duplicate subscriptions by providing a single source of truth.
 */
export interface DashboardData {
  accounts: PlainAccount[];
  enrichedJournals: EnrichedJournal[];
  balances: AccountBalance[];
  wealthSummary: WealthSummary;
}

export interface LiveAccountsSummaryData {
  accounts: PlainAccount[];
  balances: AccountBalance[];
  wealthSummary: WealthSummary;
}

export interface AccountDashboardData {
  account: PlainAccount | null;
  balance: AccountBalance | null;
  subAccounts: AccountBalance[];
  allAccounts: PlainAccount[];
}

/**
 * ReactiveDataService - Centralized observable management for dashboard data.
 *
 * Consolidates multiple repository subscriptions into shared observables
 * to eliminate duplicate subscriptions and reduce re-render overhead.
 *
 * Uses explicitly owned replay streams to multicast emissions to all subscribers.
 *
 * Workplace base observes live in `reactiveWorkplaceObserves` — import those
 * directly instead of pass-through helpers on this service.
 */
class ReactiveDataService {
  // M-1 fix: cache dashboard observables per currency and workplace so multiple hook subscribers
  // share a single combineLatest chain.
  private _dashboardCache = new Map<string, ReactiveCacheEntry<DashboardData>>();
  private _optimizedAccountListCache = new Map<
    string,
    ReactiveCacheEntry<LiveAccountsSummaryData>
  >();
  private _accountDashboardCache = new Map<string, ReactiveCacheEntry<AccountDashboardData>>();

  /**
   * Clears all cached observables. Primarily used for unit test isolation.
   */
  clearCache(workplaceId?: WorkplaceId): void {
    this.invalidateAccountCaches(workplaceId);
    clearReactiveAggregatedBalancesCache(workplaceId);
    if (workplaceId === undefined) {
      clearReactiveWorkplaceObservesCache();
    }
  }

  /** Drop cached account-detail graphs so archive mutations re-hydrate. */
  invalidateAccountCaches(workplaceId?: WorkplaceId): void {
    this.disposeCache(this._dashboardCache, workplaceId);
    this.disposeCache(this._optimizedAccountListCache, workplaceId);
    this.disposeCache(this._accountDashboardCache, workplaceId);
  }

  private disposeCache<T>(
    cache: Map<string, ReactiveCacheEntry<T>>,
    workplaceId?: WorkplaceId,
  ): void {
    for (const [key, entry] of cache) {
      if (workplaceId !== undefined && entry.workplaceId !== workplaceId) continue;
      entry.dispose();
      cache.delete(key);
    }
  }

  /**
   * Background hydration pass for reactive streams.
   * Call this during app bootstrap to pre-calculate and cache expensive data
   * like the dashboard and optimized account list before the user navigates to those screens.
   */
  async preWarm(targetCurrency: string, workplaceId: WorkplaceId): Promise<void> {
    const trace = traceService.startTrace('ReactiveDataService.preWarm');
    try {
      // Warm up both dashboard and optimized account list
      // This ensures that when the user lands on the Home or Accounts screen,
      // the data is already hydrated and held by the managed replay cache.
      await Promise.allSettled([
        firstValueFrom(this.observeDashboardData(targetCurrency, workplaceId)),
        firstValueFrom(this.observeOptimizedAccountList(targetCurrency, workplaceId)),
      ]);
      logger.info('[ReactiveDataService] Pre-warm complete');
    } catch (error) {
      logger.warn('[ReactiveDataService] Pre-warm failed', { error });
    } finally {
      trace.end();
    }
  }

  /**
   * Get or create the shared dashboard data observable for the given currency and workplace.
   */
  observeDashboardData(
    targetCurrency: string,
    workplaceId: WorkplaceId,
  ): Observable<DashboardData> {
    const cacheKey = `${targetCurrency}_${workplaceId}`;
    if (this._dashboardCache.has(cacheKey)) {
      return this._dashboardCache.get(cacheKey)!.observable;
    }

    // Cap to 1 entry: currency changes are rare; evict any stale graph immediately
    // so we don't accumulate dangling combineLatest chains over the bridge.
    if (this._dashboardCache.size > 0) {
      this.invalidateAccountCaches();
      clearReactiveAggregatedBalancesCache();
      clearReactiveWorkplaceAccountsAndJournalMetaCache();
    }

    // Optimized: Derive from the high-performance SQL balance stream
    const obs$ = combineLatest([
      observeAggregatedAccountBalances(targetCurrency, workplaceId),
      observeEnrichedJournals(
        workplaceId,
        AppConfig.pagination.dashboardPageSize,
        undefined,
        undefined,
        undefined,
      ),
    ]).pipe(
      map(([base, enrichedJournals]) => {
        const { accounts, balancesMap, wealthSummary } = base;
        const plainAccounts = toPlainAccounts(accounts);

        const data: DashboardData = {
          accounts: plainAccounts,
          enrichedJournals,
          balances: Array.from(balancesMap.values()),
          wealthSummary,
        };
        return data;
      }),
      tap(data => {
        // Persist for Instant Boot on next launch
        snapshotService.saveDashboardSnapshot(workplaceId, data);
      }),
    );

    const replay = createDisposableReplay(obs$);

    const loggedObs$ = new Observable<DashboardData>(subscriber => {
      const subStart = performance.now();
      let firstEmission = true;
      const sub = replay.observable.subscribe({
        next: value => {
          if (firstEmission) {
            const duration = performance.now() - subStart;
            logger.metric('Hydration.Hit.Dashboard', duration, {
              hit: duration < 50,
              currency: targetCurrency,
            });
            firstEmission = false;
          }
          subscriber.next(value);
        },
        error: err => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
      return () => sub.unsubscribe();
    });

    this._dashboardCache.set(cacheKey, { ...replay, observable: loggedObs$, workplaceId });
    return loggedObs$;
  }

  /**
   * Optimized lightweight observable for the Accounts List.
   * Uses raw SQL for heavy lifting and minimizes JS thread overhead.
   */
  observeOptimizedAccountList(
    targetCurrency: string,
    workplaceId: WorkplaceId,
  ): Observable<LiveAccountsSummaryData> {
    const cacheKey = `${targetCurrency}_${workplaceId}`;
    if (this._optimizedAccountListCache.has(cacheKey)) {
      return this._optimizedAccountListCache.get(cacheKey)!.observable;
    }

    const obs$ = observeAggregatedAccountBalances(targetCurrency, workplaceId).pipe(
      map(({ accounts, balancesMap, wealthSummary }) => {
        const plainAccounts = toPlainAccounts(accounts);

        const data: LiveAccountsSummaryData = {
          accounts: plainAccounts,
          balances: Array.from(balancesMap.values()),
          wealthSummary,
        };
        return data;
      }),
      tap(data => {
        // Persist for Instant Boot / Remount on Accounts Screen
        snapshotService.saveCustomSnapshot(workplaceId, 'accounts_list_data', data);
      }),
    );

    const replay = createDisposableReplay(obs$);

    const loggedObs$ = new Observable<LiveAccountsSummaryData>(subscriber => {
      const subStart = performance.now();
      let firstEmission = true;
      const sub = replay.observable.subscribe({
        next: value => {
          if (firstEmission) {
            const duration = performance.now() - subStart;
            logger.metric('Hydration.Hit.AccountList', duration, {
              hit: duration < 50,
            });
            firstEmission = false;
          }
          subscriber.next(value);
        },
        error: err => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
      return () => sub.unsubscribe();
    });

    this._optimizedAccountListCache.set(cacheKey, {
      ...replay,
      observable: loggedObs$,
      workplaceId,
    });
    return loggedObs$;
  }

  /**
   * Retrieves the last saved accounts list snapshot for a specific workplace.
   */
  getAccountsListSnapshot(workplaceId: WorkplaceId): LiveAccountsSummaryData | null {
    return snapshotService.getCustomSnapshot<LiveAccountsSummaryData>(
      workplaceId,
      'accounts_list_data',
    );
  }

  /**
   * Optimized observable for a specific account's dashboard/detail view.
   * Consolidates account info, balance, and sub-account tree.
   */
  observeAccountDashboard(
    accountId: AccountId,
    targetCurrency: string,
    workplaceId: WorkplaceId,
  ): Observable<AccountDashboardData> {
    const cacheKey = `${accountId}_${targetCurrency}_${workplaceId}`;
    if (this._accountDashboardCache.has(cacheKey)) {
      return this._accountDashboardCache.get(cacheKey)!.observable;
    }

    const obs$ = observeAggregatedAccountBalances(targetCurrency, workplaceId).pipe(
      switchMap(async ({ accounts, balancesMap }) => {
        const plainAccounts = toPlainAccounts(accounts);
        const targetAccount = plainAccounts.find(a => a.id === accountId);
        if (!targetAccount) {
          const deletedAccount = await accountRepository.findWithDeleted(workplaceId, accountId);
          return {
            account: deletedAccount ? toPlainAccount(deletedAccount) : null,
            balance: null,
            subAccounts: [],
            allAccounts: plainAccounts,
          };
        }

        const balance = balancesMap.get(accountId) || null;

        const descendants = getAccountDescendants(accounts, accountId);
        const subBalances = descendants
          .map(d => balancesMap.get(d.id))
          .filter((b): b is AccountBalance => !!b);

        return {
          account: targetAccount,
          balance,
          subAccounts: subBalances,
          allAccounts: plainAccounts,
        };
      }),
    );

    const replay = createDisposableReplay(obs$);

    const loggedObs$ = new Observable<AccountDashboardData>(subscriber => {
      const subStart = performance.now();
      let firstEmission = true;
      const sub = replay.observable.subscribe({
        next: value => {
          if (firstEmission) {
            const duration = performance.now() - subStart;
            logger.metric('Hydration.Hit.AccountDetails', duration, {
              hit: duration < 50,
              accountId,
            });
            firstEmission = false;
          }
          subscriber.next(value);
        },
        error: err => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
      return () => sub.unsubscribe();
    });

    this._accountDashboardCache.set(cacheKey, {
      ...replay,
      observable: loggedObs$,
      workplaceId,
    });
    return loggedObs$;
  }
}

export const reactiveDataService = new ReactiveDataService();
