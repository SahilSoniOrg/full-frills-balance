import { AppConfig } from '@/src/constants';
import { toPlainAccount, toPlainAccounts } from '@/src/data/models/Account';
import { observeAggregatedAccountBalances } from '@/src/services/reactive/reactiveAggregatedBalances';
import { clearReactiveWorkplaceAccountsAndJournalMetaCache } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { getAccountDescendants } from '@/src/services/accounts/accountDescendants';
import { observeEnrichedJournals } from '@/src/services/journal/journalTimelineReadModel';
import { WealthSummary } from '@/src/services/wealth-service';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { AccountBalance, EnrichedJournal } from '@/src/types/domainReadModels';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { PlainAccount } from '@/src/types/plainDtos';
import { logger } from '@/src/utils/logger';
import { firstValueFrom, combineLatest, Observable, switchMap, map, tap } from 'rxjs';
import { snapshotService } from '@/src/utils/SnapshotService';
import { traceService } from '@/src/utils/TraceService';
import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';

function withFirstEmissionMetric<T>(
  source$: Observable<T>,
  metricName: string,
  context?: Record<string, unknown>,
): Observable<T> {
  return new Observable<T>(subscriber => {
    const subStart = performance.now();
    let firstEmission = true;
    const sub = source$.subscribe({
      next: value => {
        if (firstEmission) {
          const duration = performance.now() - subStart;
          logger.metric(metricName, duration, { ...context, hit: duration < 50 });
          firstEmission = false;
        }
        subscriber.next(value);
      },
      error: err => subscriber.error(err),
      complete: () => subscriber.complete(),
    });
    return () => sub.unsubscribe();
  });
}

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
  /**
   * Clears all cached observables. Primarily used for unit test isolation.
   */
  clearCache(workplaceId?: WorkplaceId): void {
    reactiveCacheCoordinator.clearAll(workplaceId);
  }

  /** Drop cached account-detail graphs so archive mutations re-hydrate. */
  invalidateAccountCaches(workplaceId?: WorkplaceId): void {
    reactiveCacheCoordinator.clearNamespaces(
      [
        REACTIVE_CACHE_NAMESPACES.dashboard,
        REACTIVE_CACHE_NAMESPACES.optimizedAccountList,
        REACTIVE_CACHE_NAMESPACES.accountDashboard,
      ],
      workplaceId,
    );
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
    // Cap to 1 entry: currency changes are rare; evict any stale graph immediately
    // so we don't accumulate dangling combineLatest chains over the bridge.
    if (
      !reactiveCacheCoordinator.has(REACTIVE_CACHE_NAMESPACES.dashboard, cacheKey) &&
      reactiveCacheCoordinator.hasNamespace(REACTIVE_CACHE_NAMESPACES.dashboard)
    ) {
      this.invalidateAccountCaches();
      reactiveCacheCoordinator.clearNamespace(REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances);
      clearReactiveWorkplaceAccountsAndJournalMetaCache();
    }

    return reactiveCacheCoordinator.getOrCreate({
      namespace: REACTIVE_CACHE_NAMESPACES.dashboard,
      key: cacheKey,
      workplaceId,
      createSource: () =>
        combineLatest([
          // Optimized: Derive from the high-performance SQL balance stream
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
            snapshotService.deferDashboardSnapshot(workplaceId, data);
          }),
        ),
      decorate: observable =>
        withFirstEmissionMetric(observable, 'Hydration.Hit.Dashboard', {
          currency: targetCurrency,
        }),
    });
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
    return reactiveCacheCoordinator.getOrCreate({
      namespace: REACTIVE_CACHE_NAMESPACES.optimizedAccountList,
      key: cacheKey,
      workplaceId,
      createSource: () =>
        observeAggregatedAccountBalances(targetCurrency, workplaceId).pipe(
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
            snapshotService.deferCustomSnapshot(workplaceId, 'accounts_list_data', data);
          }),
        ),
      decorate: observable => withFirstEmissionMetric(observable, 'Hydration.Hit.AccountList'),
    });
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
    return reactiveCacheCoordinator.getOrCreate({
      namespace: REACTIVE_CACHE_NAMESPACES.accountDashboard,
      key: cacheKey,
      workplaceId,
      createSource: () =>
        observeAggregatedAccountBalances(targetCurrency, workplaceId).pipe(
          switchMap(async ({ accounts, balancesMap }) => {
            const plainAccounts = toPlainAccounts(accounts);
            const targetAccount = plainAccounts.find(a => a.id === accountId);
            if (!targetAccount) {
              const deletedAccount = await accountQueryRepository.findWithDeleted(
                workplaceId,
                accountId,
              );
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
        ),
      decorate: observable =>
        withFirstEmissionMetric(observable, 'Hydration.Hit.AccountDetails', {
          accountId,
        }),
    });
  }
}

export const reactiveDataService = new ReactiveDataService();
