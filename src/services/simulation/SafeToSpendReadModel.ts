import { Animation, AppConfig } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { balanceService } from '@/src/services/BalanceService';
import { budgetReadService, BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import {
  assembleSafeToSpendDashboard,
  buildNetCashFlowByDay,
  buildSafeToSpendHistoryPoints,
  computeLiquidSafeDaysCount,
  createEmptySafeToSpendDashboard,
  mapSimulationToProjectionPoints,
} from '@/src/services/simulation/safeToSpendDashboardProjection';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { isLiquidAssetSubtype } from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { snapshotService } from '@/src/utils/SnapshotService';
import { traceService } from '@/src/utils/TraceService';
import dayjs from 'dayjs';
import { Platform } from 'react-native';
import { combineLatest, firstValueFrom, from, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, take } from 'rxjs/operators';
import type { SafeToSpendResult } from '@/src/services/simulation/safeToSpendDashboardProjection';
export type {
  SafeToSpendDashboard,
  SafeToSpendDataPoint,
  SafeToSpendProjection,
  SafeToSpendResult,
} from '@/src/services/simulation/safeToSpendDashboardProjection';

/** Widget / headline path — intentionally tiny. */
export type SafeToSpendHeadline = {
  currencyCode: string;
  safeToSpend: number;
  shortfall: number;
  trajectoryMinBalance: number;
  firstMajorInflowDay: number | null;
};

export interface SafeToSpendHandle {
  /** Dashboard default — currency and window resolved inside the Module. */
  watch(): Observable<SafeToSpendResult>;
  /** Widget sync — same underlying projection, headline fields only. */
  watchHeadline(): Observable<SafeToSpendHeadline>;
  /** Splash pre-warm — fire-and-forget first emission. */
  preWarm(): Promise<void>;
}

function toHeadline(result: SafeToSpendResult): SafeToSpendHeadline {
  return {
    currencyCode: result.currencyCode,
    safeToSpend: result.summary.safeToSpend,
    shortfall: result.summary.shortfall,
    trajectoryMinBalance: result.summary.trajectoryMinBalance,
    firstMajorInflowDay: result.summary.firstMajorInflowDay ?? null,
  };
}

export class SafeToSpendReadModel {
  private safeToSpendCache = new Map<string, Observable<SafeToSpendResult>>();
  private workplaceWatchCache = new Map<string, Observable<SafeToSpendResult>>();

  clearCache(): void {
    this.safeToSpendCache.clear();
    this.workplaceWatchCache.clear();
  }

  /**
   * Bind Safe-to-Spend to a workplace. Currency and safeToSpendDays are
   * resolved inside the Implementation — callers do not pass them.
   */
  forWorkplace(workplaceId: WorkplaceId): SafeToSpendHandle {
    return {
      watch: () => this.watchWorkplace(workplaceId),
      watchHeadline: () => this.watchWorkplace(workplaceId).pipe(map(toHeadline)),
      preWarm: async () => {
        if (Platform.OS === 'web') return;
        try {
          await firstValueFrom(this.watchWorkplace(workplaceId).pipe(take(1)));
        } catch (error) {
          logger.warn('[SafeToSpendReadModel] Pre-warm failed', { error });
        }
      },
    };
  }

  private watchWorkplace(workplaceId: WorkplaceId): Observable<SafeToSpendResult> {
    const cached = this.workplaceWatchCache.get(workplaceId);
    if (cached) return cached;

    const obs = workplaceService.observeCurrency(workplaceId).pipe(
      switchMap(currencyCode => this.observeSafeToSpend(workplaceId, currencyCode)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.workplaceWatchCache.set(workplaceId, obs);
    return obs;
  }

  /**
   * @internal Prefer `forWorkplace(id).watch()` — kept for cache-key tests and direct currency override.
   */
  observeSafeToSpend(
    workplaceId: WorkplaceId,
    defaultCurrencyCode: string,
  ): Observable<SafeToSpendResult> {
    const cacheKey = `${workplaceId}_${defaultCurrencyCode}`;
    const cached = this.safeToSpendCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.safeToSpendCache.size > 0) {
      this.safeToSpendCache.clear();
    }

    const obs = combineLatest([preferences.sts.observeSafeToSpendDays()]).pipe(
      switchMap(([safeToSpendDays]) => {
        return combineLatest([
          reactiveDataService.observeAccounts(workplaceId),
          budgetRepository.observeAllActive(workplaceId),
          plannedPaymentRepository.observeActive(workplaceId),
          journalRepository.observePlannedInRange(
            workplaceId,
            dayjs().subtract(safeToSpendDays, 'day').startOf('day').valueOf(),
            dayjs().add(safeToSpendDays, 'day').endOf('day').valueOf(),
          ),
          reactiveDataService.observeActiveCount(workplaceId),
          reactiveDataService.observeJournalMeta(workplaceId),
        ] as [
          Observable<Account[]>,
          Observable<Budget[]>,
          Observable<PlannedPayment[]>,
          Observable<Journal[]>,
          Observable<number>,
          Observable<any>,
        ]).pipe(
          map(([allAccounts, budgets, plannedPayments, plannedJournals]) => {
            const assets = allAccounts.filter(a => a.accountType === AccountType.ASSET);
            const liabilities = allAccounts.filter(a => a.accountType === AccountType.LIABILITY);
            return {
              assets,
              liabilities,
              budgets,
              plannedPayments,
              allAccounts,
              plannedJournals,
              safeToSpendDays,
              defaultCurrencyCode,
              workplaceId,
            };
          }),
        );
      }),
      firstFastDebounce(Animation.observeDebounce),
      switchMap(
        ({
          assets,
          liabilities,
          budgets,
          plannedPayments,
          allAccounts,
          plannedJournals,
          safeToSpendDays,
          defaultCurrencyCode,
          workplaceId,
        }) => {
          const now = dayjs();
          const startOfToday = now.startOf('day');
          const lookbackDate = startOfToday.subtract(safeToSpendDays, 'day').valueOf();

          const parentIds = new Set<AccountId>(
            allAccounts.map(a => a.parentAccountId).filter((id): id is AccountId => Boolean(id)),
          );

          const liquidAssets = assets.filter(
            a => isLiquidAssetSubtype(a.accountSubtype) && !parentIds.has(a.id),
          );
          const liquidLiabilities = liabilities.filter(
            l => l.accountType === AccountType.LIABILITY && !parentIds.has(l.id),
          );

          const liquidAssetIds = liquidAssets.map(a => a.id);

          const history$ = from(
            transactionRawRepository.getDailyDeltasGroupedRaw(
              workplaceId,
              liquidAssetIds,
              lookbackDate,
              startOfToday.valueOf() + AppConfig.time.msPerDay,
            ),
          );

          if (liquidAssets.length === 0) {
            return of(createEmptySafeToSpendDashboard(defaultCurrencyCode));
          }

          const budgetUsageObservables = budgets.map(b =>
            budgetReadService.observeBudgetUsage(workplaceId, b),
          );

          const budgetUsage$ =
            budgetUsageObservables.length > 0
              ? combineLatest(budgetUsageObservables)
              : of([] as BudgetUsage[]);

          return combineLatest([budgetUsage$, history$]).pipe(
            switchMap(async ([usages, rawDeltas]) => {
              const trace = traceService.startTrace('SafeToSpendReadModel.observeSafeToSpend');

              const uniqueBaseCurrencies = new Set<string>();
              uniqueBaseCurrencies.add(defaultCurrencyCode);

              for (const a of liquidAssets) {
                if (a.currencyCode && a.currencyCode !== defaultCurrencyCode) {
                  uniqueBaseCurrencies.add(a.currencyCode);
                }
              }
              for (const l of liquidLiabilities) {
                if (l.currencyCode && l.currencyCode !== defaultCurrencyCode) {
                  uniqueBaseCurrencies.add(l.currencyCode);
                }
              }

              for (const b of budgets) {
                if (b.currencyCode && b.currencyCode !== defaultCurrencyCode) {
                  uniqueBaseCurrencies.add(b.currencyCode);
                }
              }

              await Promise.all(
                Array.from(uniqueBaseCurrencies).map(base =>
                  exchangeRateService.fetchRatesForBase(base).catch(() => ({})),
                ),
              );

              const allBalances = await balanceService.getAccountBalances(
                workplaceId,
                now.valueOf(),
                defaultCurrencyCode,
                trace,
              );
              const balancesMapByAccountId = new Map(
                allBalances.map(b => [b.accountId, b.balance]),
              );

              trace.metric('fetch_balances');

              const startingBalances = new Map<AccountId, number>();
              let totalLiquidAssetsAmount = 0;

              for (const a of liquidAssets) {
                const balance = balancesMapByAccountId.get(a.id) || 0;
                totalLiquidAssetsAmount += balance;
                startingBalances.set(a.id, balance);
              }

              const totalLiquidMoney = Money.from(totalLiquidAssetsAmount, defaultCurrencyCode);

              const liabilityAccountBalances = liquidLiabilities.map(l => {
                const balance = Math.abs(balancesMapByAccountId.get(l.id) || 0);
                return {
                  account: l,
                  balance,
                };
              });

              trace.metric('fetch_balances_processed');

              const runResult = await cashFlowSimulationService.simulate({
                startingBalances,
                plannedPayments,
                plannedJournals,
                liquidAssetIds,
                liabilityAccountBalances,
                budgets,
                usages,
                allAccounts,
                resultCurrency: defaultCurrencyCode,
                workplaceId,
                simulationDays: safeToSpendDays,
                trace,
              });

              trace.metric('simulation_complete');

              const netCashFlowByDay = buildNetCashFlowByDay(rawDeltas || [], defaultCurrencyCode);

              const historyPoints = buildSafeToSpendHistoryPoints({
                startOfToday,
                safeToSpendDays,
                totalLiquidAssets: totalLiquidMoney.amount,
                netCashFlowByDay,
              });

              const projectionPoints = mapSimulationToProjectionPoints(runResult);

              const safeDaysCount = computeLiquidSafeDaysCount({
                liquidAssetIds,
                startingBalances,
                runResult,
              });

              trace.end();

              const result = assembleSafeToSpendDashboard({
                runResult,
                defaultCurrencyCode,
                safeToSpendDays,
                totalLiquidAssets: totalLiquidMoney.amount,
                liquidAssetIds,
                startingBalances,
                historyPoints,
                projectionPoints,
                safeDaysCount,
              });

              try {
                snapshotService.saveCustomSnapshot(workplaceId, 'safe_to_spend', result);
              } catch (e) {
                logger.warn('[SafeToSpendReadModel] Failed to save snapshot', { error: e });
              }

              return result;
            }),
            catchError(err => {
              logger.error(
                `[SafeToSpendReadModel] Error in simulation pipeline (Workplace: ${workplaceId}):`,
                err,
              );
              return of(createEmptySafeToSpendDashboard(defaultCurrencyCode));
            }),
          );
        },
      ),
      catchError(err => {
        logger.error(
          `[SafeToSpendReadModel] Outer pipeline error (Workplace: ${workplaceId}):`,
          err,
        );
        return of(createEmptySafeToSpendDashboard(defaultCurrencyCode));
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.safeToSpendCache.set(cacheKey, obs);
    return obs;
  }
}

export const safeToSpendReadModel = new SafeToSpendReadModel();
