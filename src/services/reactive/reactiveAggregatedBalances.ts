import { Animation } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { accountListMetricsQueries } from '@/src/data/repositories/account/AccountListMetricsQueries';
import { mapAccountListRowToBalance } from '@/src/data/repositories/account/accountListBalanceMapping';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { balanceService } from '@/src/services/BalanceService';
import {
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { wealthService, WealthSummary } from '@/src/services/wealth-service';
import { AccountBalance, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { snapshotService } from '@/src/utils/SnapshotService';
import { traceService } from '@/src/utils/TraceService';
import { combineLatest, distinctUntilChanged, Observable, shareReplay, switchMap } from 'rxjs';

type RawSQLRow = Record<string, unknown>;

export interface AggregatedAccountBalances {
  accounts: Account[];
  balancesMap: Map<string, AccountBalance>;
  wealthSummary: WealthSummary;
}

const aggregatedBalancesCache = new Map<string, Observable<AggregatedAccountBalances>>();

export function clearReactiveAggregatedBalancesCache(): void {
  aggregatedBalancesCache.clear();
}

/**
 * Shared SQL + hierarchy balance stream for account list and detail screens.
 */
export function observeAggregatedAccountBalances(
  targetCurrency: string,
  workplaceId: WorkplaceId,
): Observable<AggregatedAccountBalances> {
  const cacheKey = `${targetCurrency}_${workplaceId}`;
  if (aggregatedBalancesCache.has(cacheKey)) {
    return aggregatedBalancesCache.get(cacheKey)!;
  }

  const obs$ = combineLatest([
    observeWorkplaceAccounts(workplaceId),
    observeWorkplaceJournalMeta(workplaceId),
    observeWorkplaceActiveTransactionCount(workplaceId),
    exchangeRateRepository.observeAll(),
  ]).pipe(
    firstFastDebounce(Animation.dataRefreshDebounce),
    distinctUntilChanged((prev, curr) => {
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

        const rawItemsResponse = await accountListMetricsQueries.getAccountListItemsRaw(
          startOfMonth,
          endOfMonth,
          workplaceId,
          true,
          true,
        );

        const rawItems: RawSQLRow[] = Array.isArray(rawItemsResponse)
          ? (rawItemsResponse as unknown as RawSQLRow[])
          : (((rawItemsResponse as unknown as { rows?: RawSQLRow[] })?.rows || []) as RawSQLRow[]);

        const balances: AccountBalance[] = rawItems.map(item =>
          mapAccountListRowToBalance(item, now.getTime()),
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

        const finalBalances = Array.from(balancesMap.values());
        const parentIds = new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
        const leafBalances = finalBalances.filter(b => !parentIds.has(b.accountId));
        const wealthSummary = wealthService.calculateSummarySync(leafBalances, targetCurrency);

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

  aggregatedBalancesCache.set(cacheKey, obs$);
  return obs$;
}
