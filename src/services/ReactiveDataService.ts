import { Animation, AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { journalService } from '@/src/features/journal/services/JournalService';
import { balanceService } from '@/src/services/BalanceService';
import { wealthService, WealthSummary } from '@/src/services/wealth-service';
import {
  AccountBalance,
  AccountId,
  AccountType,
  EnrichedJournal,
  JournalDisplayType,
  PlainAccount,
  WorkplaceId,
} from '@/src/types/domain';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { logger } from '@/src/utils/logger';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { traceService } from '@/src/utils/TraceService';
import { snapshotService } from '@/src/utils/SnapshotService';
import {
  combineLatest,
  distinctUntilChanged,
  firstValueFrom,
  Observable,
  shareReplay,
  switchMap,
} from 'rxjs';

type RawSQLRow = Record<string, unknown>;

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
  private _allBalancesCache = new Map<
    string,
    Observable<{
      accounts: Account[];
      balancesMap: Map<string, AccountBalance>;
      wealthSummary: WealthSummary;
    }>
  >();

  // Base Shared Observables to avoid redundant initial fetches across different caches
  private _accountsObsCache = new Map<WorkplaceId, Observable<Account[]>>();
  private _journalMetaObsCache = new Map<WorkplaceId, Observable<Journal[]>>();
  private _activeCountObsCache = new Map<WorkplaceId, Observable<number>>();

  /**
   * Clears all cached observables. Primarily used for unit test isolation.
   */
  clearCache(): void {
    this._dashboardCache.clear();
    this._optimizedAccountListCache.clear();
    this._accountDashboardCache.clear();
    this._allBalancesCache.clear();
    this._accountsObsCache.clear();
    this._journalMetaObsCache.clear();
    this._activeCountObsCache.clear();
  }

  /**
   * Observe all accounts for a workplace.
   * Shared and cached via shareReplay.
   */
  observeAccounts(workplaceId: WorkplaceId): Observable<Account[]> {
    if (this._accountsObsCache.has(workplaceId)) {
      return this._accountsObsCache.get(workplaceId)!;
    }
    const obs$ = accountRepository
      .observeAll(workplaceId)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this._accountsObsCache.set(workplaceId, obs$);
    return obs$;
  }

  /**
   * Observe journal status metadata (posted/deleted counts).
   */
  observeJournalMeta(workplaceId: WorkplaceId): Observable<Journal[]> {
    if (this._journalMetaObsCache.has(workplaceId)) {
      return this._journalMetaObsCache.get(workplaceId)!;
    }
    const obs$ = journalRepository
      .observeStatusMeta(workplaceId)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this._journalMetaObsCache.set(workplaceId, obs$);
    return obs$;
  }

  /**
   * Observe total active transaction count.
   */
  observeActiveCount(workplaceId: WorkplaceId): Observable<number> {
    if (this._activeCountObsCache.has(workplaceId)) {
      return this._activeCountObsCache.get(workplaceId)!;
    }
    const obs$ = transactionRepository
      .observeActiveCount(workplaceId)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this._activeCountObsCache.set(workplaceId, obs$);
    return obs$;
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
      this._accountsObsCache.clear();
      this._journalMetaObsCache.clear();
    }

    // Optimized: Derive from the high-performance SQL balance stream
    const obs$ = combineLatest([
      this.observeAllBalances(targetCurrency, workplaceId),
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
   * Internal shared stream for all balance-related views.
   * Consolidates raw SQL balance fetching and hierarchy aggregation.
   * Multicasted with refCount: false to keep it warm during navigation.
   */
  private observeAllBalances(
    targetCurrency: string,
    workplaceId: WorkplaceId,
  ): Observable<{
    accounts: Account[];
    balancesMap: Map<string, AccountBalance>;
    wealthSummary: WealthSummary;
  }> {
    const cacheKey = `${targetCurrency}_${workplaceId}`;
    if (this._allBalancesCache.has(cacheKey)) {
      return this._allBalancesCache.get(cacheKey)!;
    }

    const obs$ = combineLatest([
      this.observeAccounts(workplaceId),
      this.observeJournalMeta(workplaceId),
      this.observeActiveCount(workplaceId),
      exchangeRateRepository.observeAll(),
    ]).pipe(
      firstFastDebounce(Animation.dataRefreshDebounce),
      distinctUntilChanged((prev, curr) => {
        // Only re-run if accounts structure, journal status, or tx count changed.
        // Exchange rates (curr[3]) are handled by the switchMap.
        return (
          prev[0] === curr[0] && prev[1] === curr[1] && prev[2] === curr[2] && prev[3] === curr[3]
        );
      }),
      switchMap(async ([accounts]) => {
        const trace = traceService.startTrace('AllBalances.Calculate');
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

          // Fetch ALL balances raw (includes totals and deleted for maximum utility)
          const rawItemsResponse = await accountRepository.getAccountListItemsRaw(
            startOfMonth,
            endOfMonth,
            workplaceId,
            true, // includeTotalCount: true (needed for detail views)
            true, // includeDeleted: true (needed for detail views)
          );

          let finalBalances: AccountBalance[] = [];
          const rawItems: RawSQLRow[] = Array.isArray(rawItemsResponse)
            ? (rawItemsResponse as unknown as RawSQLRow[])
            : (((rawItemsResponse as any)?.rows || []) as RawSQLRow[]);

          const balances: AccountBalance[] = rawItems.map((item: RawSQLRow) =>
            this.mapRawToBalance(item, now.getTime()),
          );

          const validBalances = balances.filter(b => b.accountId && b.accountId !== 'undefined');
          const balancesMap = new Map(validBalances.map(b => [b.accountId, b]));

          const currencyPrecisionMap = await currencyRepository.getAllPrecisions();
          const precisionMap = new Map<string, number>();
          for (const account of accounts) {
            const precision = currencyPrecisionMap.get(account.currencyCode) ?? 2;
            precisionMap.set(account.id, precision);
          }

          await balanceService.aggregateBalances(
            accounts,
            balancesMap,
            precisionMap,
            targetCurrency,
            trace,
          );

          finalBalances = Array.from(balancesMap.values());
          const parentIds = new Set(
            accounts.map(a => a.parentAccountId).filter(Boolean) as string[],
          );
          const leafBalances = finalBalances.filter(b => !parentIds.has(b.accountId));
          const wealthSummary = wealthService.calculateSummarySync(leafBalances, targetCurrency);

          // Persist summary snapshot (smaller, faster to load than full dashboard)
          snapshotService.saveWealthSnapshot(workplaceId, wealthSummary);

          return { accounts, balancesMap, wealthSummary };
        } catch (error) {
          logger.error('Failed to calculate shared balances:', error);
          return {
            accounts,
            balancesMap: new Map(),
            wealthSummary: wealthService.calculateSummarySync([], targetCurrency),
          };
        } finally {
          trace.end();
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this._allBalancesCache.set(cacheKey, obs$);
    return obs$;
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

    const obs$ = this.observeAllBalances(targetCurrency, workplaceId).pipe(
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

    const obs$ = this.observeAllBalances(targetCurrency, workplaceId).pipe(
      switchMap(async ({ accounts, balancesMap }) => {
        const targetAccount = accounts.find(a => a.id === accountId);
        if (!targetAccount) {
          const deletedAccount = await accountRepository.findWithDeleted(workplaceId, accountId);
          return { account: deletedAccount, balance: null, subAccounts: [], allAccounts: accounts };
        }

        const balance = balancesMap.get(accountId) || null;

        // Get sub-accounts (all descendants)
        const getDescendants = (parentId: string): Account[] => {
          const directChildren = accounts.filter(a => a.parentAccountId === parentId);
          const all: Account[] = [...directChildren];
          for (const child of directChildren) {
            all.push(...getDescendants(child.id));
          }
          return all;
        };

        const descendants = getDescendants(accountId);
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

  private mapRawToBalance(item: RawSQLRow, now: number): AccountBalance {
    // Optimization: Direct access for known SQL aliases instead of expensive regex loop
    const accountId = (item.id || item.accountId || item.account_id) as AccountId;
    const balance = Number(item.direct_balance || item.directBalance || 0);
    const currencyCode = (item.currency_code || item.currencyCode) as string;
    const accountType = (item.account_type || item.accountType) as AccountType;
    const income = Number(item.monthly_income || item.monthlyIncome || 0);
    const expenses = Number(item.monthly_expenses || item.monthlyExpenses || 0);
    const txCount = Number(item.direct_transaction_count || item.directTransactionCount || 0);

    return {
      accountId: accountId,
      balance: balance,
      directBalance: balance,
      currencyCode: String(currencyCode),
      transactionCount: txCount,
      directTransactionCount: txCount,
      asOfDate: now,
      accountType: accountType,
      monthlyIncome: income,
      monthlyExpenses: expenses,
    };
  }
}

export const reactiveDataService = new ReactiveDataService();
