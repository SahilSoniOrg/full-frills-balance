import { Animation, AppConfig } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
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
  FlowSource,
  FlowType,
  SimulationResult,
  SimulationRunResult,
} from '@/src/services/simulation/types';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { isLiquidAssetSubtype, LIQUID_ASSET_SUBTYPES } from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { Money, roundToPrecision } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { snapshotService } from '@/src/utils/SnapshotService';
import { traceService } from '@/src/utils/TraceService';
import dayjs from 'dayjs';
import { Platform } from 'react-native';
import { combineLatest, firstValueFrom, from, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, take } from 'rxjs/operators';

export interface SafeToSpendDataPoint {
  timestamp: number;
  value: number;
  isProjected: boolean;
  details?: { name: string; amount: number; type: FlowType; context?: string }[];
  dailyBurn?: number;
}

export interface SafeToSpendProjection {
  history: SafeToSpendDataPoint[];
  projection: SafeToSpendDataPoint[];
  safeDaysCount: number | null;
  safeToSpend: number;
}

export interface SafeToSpendResult {
  summary: SimulationResult['summary'] & { safeCurrentBalance?: number };
  report: SimulationRunResult['report'];
  accountSummaries: SimulationRunResult['accountSummaries'];
  totalLiquidAssets: number;
  currencyCode: string;
  liquidAssetSubtypes: AccountSubtype[];
  dailyBudgetBurn: number;
  projection: SafeToSpendProjection;
  accountMap: Map<string, Account>;
  safeToSpendDays: number;
}

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

    const obs = combineLatest([preferences.observe('safeToSpendDays')]).pipe(
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
            return of(this.getEmptySafeToSpendResult(defaultCurrencyCode));
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

              const runResult = await cashFlowSimulationService.simulate(
                startingBalances,
                plannedPayments,
                plannedJournals,
                liquidAssetIds,
                liabilityAccountBalances,
                budgets,
                usages,
                allAccounts,
                defaultCurrencyCode,
                workplaceId,
                safeToSpendDays,
                trace,
              );

              trace.metric('simulation_complete');

              const netCashFlowByDay = new Map<number, number>();
              const deltas = rawDeltas || [];
              for (const delta of deltas) {
                let amount = delta.delta;
                if (delta.currencyCode !== defaultCurrencyCode) {
                  try {
                    const rate = exchangeRateService.getRateSafe(
                      delta.currencyCode,
                      defaultCurrencyCode,
                    );
                    amount = roundToPrecision(amount * rate, 2);
                  } catch (e) {
                    logger.error('Failed to convert delta for history projection', e);
                  }
                }
                const localDayStart = dayjs(delta.dayStart).startOf('day').valueOf();
                netCashFlowByDay.set(
                  localDayStart,
                  (netCashFlowByDay.get(localDayStart) || 0) + amount,
                );
              }

              const historyPoints: SafeToSpendDataPoint[] = [];
              let runningBalance = totalLiquidMoney.amount;
              for (let i = 0; i < safeToSpendDays; i++) {
                const targetDay = startOfToday.subtract(i, 'day').valueOf();
                const flowThatDay = netCashFlowByDay.get(targetDay) || 0;
                runningBalance -= flowThatDay;
                historyPoints.push({
                  timestamp: targetDay - 1000,
                  value: runningBalance,
                  isProjected: false,
                });
              }
              historyPoints.reverse();

              const projectionPoints = runResult.simulationResult.projections.map(p => {
                const details = p.flows.map(f => ({
                  name: f.label,
                  amount: f.amount,
                  type: f.kind === 'INFLOW' ? FlowType.INFLOW : FlowType.OUTFLOW,
                  context: f.origin,
                }));

                const dailyBurn = p.flows
                  .filter(f => {
                    const isBudget = f.origin === FlowSource.BUDGET || f.resolvedFrom === 'BUDGET';
                    return isBudget && f.kind === 'OUTFLOW';
                  })
                  .reduce((sum, f) => sum + f.amount, 0);

                return {
                  timestamp: p.timestamp,
                  dayOffset: p.dayOffset,
                  value: p.globalBalance,
                  isProjected: true,
                  accountBalances: p.accountBalances,
                  details,
                  dailyBurn: dailyBurn > 0 ? dailyBurn : undefined,
                } as SafeToSpendDataPoint & { dayOffset: number };
              });

              const safeDaysCount = (function () {
                const liquidIds = new Set(liquidAssetIds);
                let startingGlobal = 0;
                for (const [accountId, balance] of startingBalances.entries()) {
                  if (liquidIds.has(accountId)) startingGlobal += balance;
                }
                if (startingGlobal < 0) return 0;
                const firstNeg = runResult.simulationResult.projections.find(
                  p => p.globalBalance < 0,
                );
                return firstNeg ? firstNeg.dayOffset + 1 : null;
              })();

              trace.end();

              const result: SafeToSpendResult = {
                summary: {
                  ...runResult.simulationResult.summary,
                  ...runResult.report.summary,
                  safeCurrentBalance: totalLiquidMoney.amount,
                  safeDaysCount,
                },
                report: runResult.report,
                accountSummaries: runResult.accountSummaries,
                totalLiquidAssets: totalLiquidMoney.amount,
                currencyCode: defaultCurrencyCode,
                liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
                dailyBudgetBurn: runResult.report.budget.currentMonthRemaining / safeToSpendDays,
                projection: {
                  history: historyPoints,
                  projection: projectionPoints as any,
                  safeDaysCount,
                  safeToSpend: runResult.simulationResult.summary.safeToSpend,
                },
                accountMap: runResult.accountMap,
                safeToSpendDays,
              };

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
              return of(this.getEmptySafeToSpendResult(defaultCurrencyCode));
            }),
          );
        },
      ),
      catchError(err => {
        logger.error(
          `[SafeToSpendReadModel] Outer pipeline error (Workplace: ${workplaceId}):`,
          err,
        );
        return of(this.getEmptySafeToSpendResult(defaultCurrencyCode));
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.safeToSpendCache.set(cacheKey, obs);
    return obs;
  }

  private getEmptySafeToSpendResult(resultCurrency: string): SafeToSpendResult {
    return {
      summary: {
        safeToSpend: 0,
        shortfall: 0,
        trajectoryMinBalance: 0,
        safeDaysCount: null,
        totalFutureInflow: 0,
        totalPlannedInflow: 0,
        totalPlannedOutflow: 0,
        totalCommittedPlanned: 0,
        firstMajorInflowDay: null,
      },
      report: {
        allFlows: [],
        liabilities: {
          total: 0,
          totalCreditCard: 0,
          totalOther: 0,
          committed: 0,
          committedCreditCard: 0,
          committedOther: 0,
        },
        budget: {
          currentMonthRemaining: 0,
          nextMonthProjected: 0,
          nextMonthDays: 0,
        },
        summary: {
          firstMajorInflowDay: null,
          totalFutureInflow: 0,
          totalPlannedInflow: 0,
          totalPlannedOutflow: 0,
          totalCommittedPlanned: 0,
        },
      },
      accountSummaries: [],
      totalLiquidAssets: 0,
      currencyCode: resultCurrency,
      liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
      dailyBudgetBurn: 0,
      projection: {
        history: [],
        projection: [],
        safeDaysCount: null,
        safeToSpend: 0,
      },
      accountMap: new Map(),
      safeToSpendDays: 0,
    };
  }
}

export const safeToSpendReadModel = new SafeToSpendReadModel();
