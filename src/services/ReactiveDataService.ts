import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import {
  clearReactiveAggregatedBalancesCache,
  observeAggregatedAccountBalances,
} from '@/src/services/reactive/reactiveAggregatedBalances';
import {
  clearReactiveWorkplaceObservesCache,
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
  clearReactiveWorkplaceAccountsAndJournalMetaCache,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { getAccountDescendants } from '@/src/services/accounts/accountDescendants';
import { journalService } from '@/src/services/journal/journalDomainService';
import { WealthSummary } from '@/src/services/wealth-service';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import {
  AccountBalance,
  AccountId,
  EnrichedJournal,
  JournalDisplayType,
  PlainAccount,
  WorkplaceId,
} from '@/src/types/domain';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { logger } from '@/src/utils/logger';
import { firstValueFrom, combineLatest, Observable, shareReplay, switchMap } from 'rxjs';
import { snapshotService } from '@/src/utils/SnapshotService';
import { traceService } from '@/src/utils/TraceService';

/**
 * Consolidated reactive data for dashboard widgets.
 * Eliminates duplicate subscriptions by providing a single source of truth.
 */
export interface DashboardData {
  accounts: (Account | PlainAccount)[];
  enrichedJournals: EnrichedJournal[];
  balances: AccountBalance[];
  wealthSummary: WealthSummary;
}

export type DashboardSummaryData = Omit<DashboardData, 'enrichedJournals'>;

export interface LiveAccountsSummaryData {
  accounts: (Account | PlainAccount)[];
  balances: AccountBalance[];
  wealthSummary: WealthSummary;
}

/**
 * Monthly income and expense flow data.
 */
export interface MonthlyFlowData {
  income: number;
  expense: number;
}

export interface AccountDashboardData {
  account: Account | PlainAccount | null;
  balance: AccountBalance | null;
  subAccounts: AccountBalance[];
  allAccounts: (Account | PlainAccount)[];
}

/**
 * ReactiveDataService - Centralized observable management for dashboard data.
 *
 * Consolidates multiple repository subscriptions into shared observables
 * to eliminate duplicate subscriptions and reduce re-render overhead.
 *
 * Uses RxJS shareReplay(1) to multicast emissions to all subscribers.
 */
class ReactiveDataService {
  // M-1 fix: cache dashboard observables per currency and workplace so multiple hook subscribers
  // share a single combineLatest chain.
  private _dashboardCache = new Map<string, Observable<DashboardData>>();
  private _optimizedAccountListCache = new Map<string, Observable<LiveAccountsSummaryData>>();
  private _accountDashboardCache = new Map<string, Observable<AccountDashboardData>>();

  /**
   * Clears all cached observables. Primarily used for unit test isolation.
   */
  clearCache(): void {
    this._dashboardCache.clear();
    this._optimizedAccountListCache.clear();
    this._accountDashboardCache.clear();
    this._accountDashboardCache.clear();
    clearReactiveWorkplaceObservesCache();
    clearReactiveAggregatedBalancesCache();
  }

  /**
   * Observe all accounts for a workplace.
   * Shared and cached via shareReplay.
   */
  observeAccounts(workplaceId: WorkplaceId): Observable<Account[]> {
    return observeWorkplaceAccounts(workplaceId);
  }

  /**
   * Observe journal status metadata (posted/deleted counts).
   */
  observeJournalMeta(workplaceId: WorkplaceId): Observable<Journal[]> {
    return observeWorkplaceJournalMeta(workplaceId);
  }

  /**
   * Observe total active transaction count.
   */
  observeActiveCount(workplaceId: WorkplaceId): Observable<number> {
    return observeWorkplaceActiveTransactionCount(workplaceId);
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
      // the data is already hydrated and multicasted via shareReplay.
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
      return this._dashboardCache.get(cacheKey)!;
    }

    // Cap to 1 entry: currency changes are rare; evict any stale graph immediately
    // so we don't accumulate dangling combineLatest chains over the bridge.
    if (this._dashboardCache.size > 0) {
      this._dashboardCache.clear();
      this._optimizedAccountListCache.clear();
      this._accountDashboardCache.clear();
      clearReactiveWorkplaceAccountsAndJournalMetaCache();
    }

    // Optimized: Derive from the high-performance SQL balance stream
    const obs$ = combineLatest([
      observeAggregatedAccountBalances(targetCurrency, workplaceId),
      journalService.observeEnrichedJournals(
        workplaceId,
        AppConfig.pagination.dashboardPageSize,
        undefined,
        undefined,
        undefined,
      ),
    ]).pipe(
      switchMap(async ([base, enrichedJournals]) => {
        const { accounts, balancesMap, wealthSummary } = base;

        // Sanitization: Map Account models to plain objects to avoid circular references during JSON.stringify
        const plainAccounts: PlainAccount[] = accounts.map(a => ({
          id: a.id,
          name: a.name,
          accountType: a.accountType,
          accountSubtype: a.accountSubtype,
          currencyCode: a.currencyCode,
          parentAccountId: a.parentAccountId,
          description: a.description,
          icon: a.icon,
          orderNum: a.orderNum,
          reconciledAt: a.reconciledAt?.getTime(),
          createdAt: a.createdAt?.getTime(),
          updatedAt: a.updatedAt?.getTime(),
          deletedAt: a.deletedAt?.getTime(),
        }));

        const data: DashboardData = {
          accounts: plainAccounts,
          enrichedJournals,
          balances: Array.from(balancesMap.values()),
          wealthSummary,
        };
        // Persist for Instant Boot on next launch
        snapshotService.saveDashboardSnapshot(workplaceId, data);
        return data;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    const loggedObs$ = new Observable<DashboardData>(subscriber => {
      const subStart = performance.now();
      let firstEmission = true;
      const sub = obs$.subscribe({
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

    this._dashboardCache.set(cacheKey, loggedObs$);
    return loggedObs$;
  }

  /**
   * Specialized lightweight observable for the Accounts List.
   * Excludes raw transactions to minimize JS thread serialization overhead.
   */
  observeAccountsSummary(
    targetCurrency: string,
    workplaceId: WorkplaceId,
  ): Observable<DashboardSummaryData> {
    return this.observeDashboardData(targetCurrency, workplaceId).pipe(
      // We map out the transactions to avoid cloning/serialization overhead for this subscriber
      switchMap(async data => {
        const { enrichedJournals, ...summary } = data;
        return summary;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }

  /**
   * Observe monthly income and expense flow.
   * Derives data from the shared dashboard observable.
   */
  observeMonthlyFlow(
    targetCurrency: string,
    workplaceId: WorkplaceId,
  ): Observable<MonthlyFlowData> {
    return this.observeDashboardData(targetCurrency, workplaceId).pipe(
      switchMap(async ({ enrichedJournals }) => {
        try {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          const endOfMonth = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          ).getTime();

          let income = 0;
          let expense = 0;

          // Parallel currency conversion using exchangeRateService
          const conversions = await Promise.all(
            enrichedJournals.map(async j => {
              if (j.journalDate < startOfMonth || j.journalDate > endOfMonth) return null;

              const { convertedAmount } = await exchangeRateService.convert(
                j.totalAmount,
                j.currencyCode || targetCurrency,
                targetCurrency,
              );

              return {
                convertedAmount,
                displayType: j.displayType,
              };
            }),
          );

          for (const conv of conversions) {
            if (!conv) continue;
            if (conv.displayType === JournalDisplayType.INCOME) {
              income += conv.convertedAmount;
            } else if (conv.displayType === JournalDisplayType.EXPENSE) {
              expense += conv.convertedAmount;
            }
          }

          return { income, expense };
        } catch (error) {
          logger.error('Failed to calculate monthly flow from enriched journals:', error);
          return { income: 0, expense: 0 };
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
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
      return this._optimizedAccountListCache.get(cacheKey)!;
    }

    const obs$ = observeAggregatedAccountBalances(targetCurrency, workplaceId).pipe(
      switchMap(async ({ accounts, balancesMap, wealthSummary }) => {
        return {
          accounts,
          balances: Array.from(balancesMap.values()),
          wealthSummary,
        };
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    const loggedObs$ = new Observable<LiveAccountsSummaryData>(subscriber => {
      const subStart = performance.now();
      let firstEmission = true;
      const sub = obs$.subscribe({
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

    this._optimizedAccountListCache.set(cacheKey, loggedObs$);
    return loggedObs$;
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
      return this._accountDashboardCache.get(cacheKey)!;
    }

    const obs$ = observeAggregatedAccountBalances(targetCurrency, workplaceId).pipe(
      switchMap(async ({ accounts, balancesMap }) => {
        const targetAccount = accounts.find(a => a.id === accountId);
        if (!targetAccount) {
          const deletedAccount = await accountRepository.findWithDeleted(workplaceId, accountId);
          return { account: deletedAccount, balance: null, subAccounts: [], allAccounts: accounts };
        }

        const balance = balancesMap.get(accountId) || null;

        const descendants = getAccountDescendants(accounts, accountId);
        const subBalances = descendants
          .map(d => balancesMap.get(d.id as AccountId))
          .filter((b): b is AccountBalance => !!b);

        return {
          account: targetAccount,
          balance,
          subAccounts: subBalances,
          allAccounts: accounts,
        };
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    const loggedObs$ = new Observable<AccountDashboardData>(subscriber => {
      const subStart = performance.now();
      let firstEmission = true;
      const sub = obs$.subscribe({
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

    this._accountDashboardCache.set(cacheKey, loggedObs$);
    return loggedObs$;
  }
}

export const reactiveDataService = new ReactiveDataService();
