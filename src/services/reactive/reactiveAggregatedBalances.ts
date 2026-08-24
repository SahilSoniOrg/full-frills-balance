import { Animation } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { accountListMetricsQueries } from '@/src/data/repositories/account/AccountListMetricsQueries';
import { mapAccountListRowToBalance } from '@/src/data/repositories/account/accountListBalanceMapping';
import { currencyReadService } from '@/src/services/currency-read-service';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { balanceService } from '@/src/services/balance';
import {
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';
import { wealthService, WealthSummary } from '@/src/services/wealth-service';
import { AccountBalance } from '@/src/types/domainReadModels';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { snapshotService } from '@/src/utils/SnapshotService';
import { traceService } from '@/src/utils/TraceService';
import { combineLatest, distinctUntilChanged, map, Observable, switchMap } from 'rxjs';

type RawSQLRow = Record<string, unknown>;

export interface AggregatedAccountBalances {
  accounts: Account[];
  balancesMap: Map<string, AccountBalance>;
  wealthSummary: WealthSummary;
}

export type AccountObservationSnapshot = {
  accounts: Account[];
  signature: string;
};

export function snapshotAccountObservation(accounts: Account[]): AccountObservationSnapshot {
  // reconciled_at, color, icon, and name are included so account-list rows (e.g. AccountCard badge / theme color) refresh
  // when reconciliation or appearance changes, independent of balance recomputation.
  const signature = accounts
    .map(
      account =>
        `${account.id}:${account.color ?? ''}:${account.icon ?? ''}:${account.name}:${account.archivedAt?.getTime() ?? 'null'}:${account.updatedAt?.getTime() ?? 'null'}:${account.reconciledAt?.getTime() ?? 'null'}`,
    )
    .join('|');
  return { accounts, signature };
}

export function clearReactiveAggregatedBalancesCache(workplaceId?: WorkplaceId): void {
  reactiveCacheCoordinator.clearNamespace(
    REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances,
    workplaceId,
  );
}

/**
 * Shared SQL + hierarchy balance stream for account list and detail screens.
 * Month-to-date accounts-list income/expense inflow is derived from periodIncrease/Decrease on this stream; other ranges use reportService.getIncomeVsExpense.
 */
export function observeAggregatedAccountBalances(
  targetCurrency: string,
  workplaceId: WorkplaceId,
): Observable<AggregatedAccountBalances> {
  return reactiveCacheCoordinator.getOrCreate({
    namespace: REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances,
    key: `${targetCurrency}_${workplaceId}`,
    workplaceId,
    createSource: () =>
      combineLatest([
        // WatermelonDB reuses mutable model instances between emissions. Snapshot
        // the fields used by distinctUntilChanged before comparing, otherwise the
        // previous emission observes the mutation too and archive changes vanish.
        observeWorkplaceAccounts(workplaceId).pipe(map(snapshotAccountObservation)),
        observeWorkplaceJournalMeta(workplaceId),
        observeWorkplaceActiveTransactionCount(workplaceId),
        exchangeRateRepository.observeAll(),
      ]).pipe(
        firstFastDebounce(Animation.dataRefreshDebounce),
        distinctUntilChanged((prev, curr) => {
          return (
            prev[0].signature === curr[0].signature &&
            prev[1] === curr[1] &&
            prev[2] === curr[2] &&
            prev[3] === curr[3]
          );
        }),
        switchMap(async ([accountsSnapshot]) => {
          const accounts = accountsSnapshot.accounts;
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
              false,
              false,
            );

            const rawItems: RawSQLRow[] = Array.isArray(rawItemsResponse)
              ? (rawItemsResponse as unknown as RawSQLRow[])
              : (((rawItemsResponse as unknown as { rows?: RawSQLRow[] })?.rows ||
                  []) as RawSQLRow[]);

            const balances: AccountBalance[] = rawItems.map(item =>
              mapAccountListRowToBalance(item, now.getTime()),
            );

            const validBalances = balances.filter(b => b.accountId && b.accountId !== 'undefined');
            const balancesMap = new Map(validBalances.map(b => [b.accountId, b]));

            const currencyPrecisionMap = await currencyReadService.getAllPrecisions();
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
            const parentIds = new Set(
              accounts.map(a => a.parentAccountId).filter(Boolean) as string[],
            );
            const leafBalances = finalBalances.filter(b => !parentIds.has(b.accountId));
            const wealthSummary = await wealthService.calculateSummary(
              leafBalances,
              targetCurrency,
            );

            snapshotService.saveWealthSnapshot(workplaceId, wealthSummary);

            return { accounts, balancesMap, wealthSummary };
          } catch (error) {
            logger.error('Failed to calculate shared balances:', error);
            return {
              accounts,
              balancesMap: new Map(),
              wealthSummary: await wealthService.calculateSummary([], targetCurrency),
            };
          } finally {
            trace.end();
          }
        }),
      ),
  });
}
