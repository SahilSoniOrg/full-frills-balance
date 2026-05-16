import { Animation } from '@/src/constants';
import Account from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { reportService } from '@/src/services/report-service';
import { wealthService, WealthSummary } from '@/src/services/wealth-service';
import { AccountBalance, AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { traceService } from '@/src/utils/TraceService';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
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
  accounts: Account[];
  transactions: Transaction[];
  balances: AccountBalance[];
  wealthSummary: WealthSummary;
}

export type DashboardSummaryData = Omit<DashboardData, 'transactions'>;

/**
 * Monthly income and expense flow data.
 */
export interface MonthlyFlowData {
  income: number;
  expense: number;
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
  private _optimizedAccountListCache = new Map<string, Observable<DashboardSummaryData>>();
  private _accountDashboardCache = new Map<string, Observable<any>>();
  private _allBalancesCache = new Map<
    string,
    Observable<{
      accounts: Account[];
      balancesMap: Map<string, AccountBalance>;
      wealthSummary: WealthSummary;
    }>
  >();

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
    }

    const obs$ = combineLatest([
      accountRepository.observeAll(workplaceId),
      transactionRepository.observeActiveWithColumns(workplaceId, [
        'amount',
        'transaction_type',
        'transaction_date',
        'currency_code',
        'account_id',
        'exchange_rate',
        'updated_at',
      ]),
      currencyRepository.observeAll(),
      journalRepository.observeStatusMeta(workplaceId),
    ]).pipe(
      firstFastDebounce(Animation.dataRefreshDebounce),
      switchMap(async ([accounts, transactions]) => {
        const trace = traceService.startTrace('DashboardData');
        try {
          const balances = await balanceService.getAccountBalances(
            workplaceId,
            undefined,
            targetCurrency,
            trace,
          );

          const parentIds = new Set(
            accounts.map(a => a.parentAccountId).filter(Boolean) as string[],
          );
          const leafBalances = balances.filter(b => !parentIds.has(b.accountId));
          const wealthSummary = await wealthService.calculateSummary(leafBalances, targetCurrency);

          return { accounts, transactions, balances, wealthSummary };
        } catch (error) {
          logger.error('Failed to calculate dashboard data:', error);
          return {
            accounts,
            transactions,
            balances: [],
            wealthSummary: {
              netWorth: 0,
              totalAssets: 0,
              totalLiabilities: 0,
              totalEquity: 0,
              totalIncome: 0,
              totalExpense: 0,
            },
          };
        } finally {
          trace.end();
        }
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
        const { transactions, ...summary } = data;
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
      switchMap(async ({ accounts, transactions }) => {
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

          return await reportService.getIncomeVsExpenseFromTransactions(
            transactions,
            accounts,
            startOfMonth,
            endOfMonth,
            targetCurrency,
          );
        } catch (error) {
          logger.error('Failed to calculate monthly flow:', error);
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
      accountRepository.observeAll(workplaceId),
      journalRepository.observeStatusMeta(workplaceId),
      transactionRepository.observeActiveCount(workplaceId),
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
          await exchangeRateService.preWarmCache();

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
  ): Observable<DashboardSummaryData> {
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

    const loggedObs$ = new Observable<DashboardSummaryData>(subscriber => {
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
  ): Observable<{
    account: Account | null;
    balance: AccountBalance | null;
    subAccounts: AccountBalance[];
    allAccounts: Account[];
  }> {
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

    const loggedObs$ = new Observable<any>(subscriber => {
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
