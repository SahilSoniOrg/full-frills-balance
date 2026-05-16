import { AppConfig } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { budgetReadService, BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { isLiquidAssetSubtype, LIQUID_ASSET_SUBTYPES } from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { Money, roundToPrecision } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { combineLatest, from, Observable, of } from 'rxjs';
import { catchError, debounceTime, map, shareReplay, switchMap } from 'rxjs/operators';
import { balanceService } from '../BalanceService';
import { Insight, insightService } from '../insight/InsightService';
import { cashFlowSimulationService } from '../simulation/CashFlowSimulationService';
import { FlowSource, FlowType, SimulationResult, SimulationRunResult } from '../simulation/types';

export { Insight, insightService };
export type NotificationCadence = 'none' | 'daily' | 'weekly';

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
  /**
   * UI AGGREGATOR SUMMARY
   * Unified source of truth for high-level metrics (Safe-to-Spend, Shortfall, etc).
   * Merges core simulation results with derived organic reporting.
   */
  summary: SimulationResult['summary'];

  /**
   * DETAILED REPORT
   * Breakdown of income, committed spend, debts, and liabilities.
   */
  report: SimulationRunResult['report'];

  accountSummaries: SimulationRunResult['accountSummaries'];

  // Liquid Asset Context
  totalLiquidAssets: number;
  currencyCode: string;
  liquidAssetSubtypes: AccountSubtype[];

  // Projections (UI Helpers)
  dailyBudgetBurn: number;
  projection: SafeToSpendProjection;
  accountMap: Map<string, Account>;
  safeToSpendDays: number;
}

export class NotificationService {
  constructor() {
    if (Platform.OS === 'web') return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  }

  /**
   * Pre-warms the Safe-to-Spend simulation pipeline in the background.
   * This triggers the heavy data observation and cache hydration during the
   * splash screen phase without blocking the first render.
   */
  preWarm(workplaceId: WorkplaceId, defaultCurrencyCode: string): void {
    if (Platform.OS === 'web') return;
    // Trigger the simulation chain. The shareReplay(1) in observeSafeToSpend
    // will ensure the first screen to subscribe gets the result instantly.
    const sub = this.observeSafeToSpend(workplaceId, defaultCurrencyCode).subscribe();

    // We keep the subscription alive for at least 10s to ensure the first results
    // are calculated and cached in the shareReplay buffer.
    setTimeout(() => sub.unsubscribe(), 10000);
  }

  async checkPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }

  async cancelAll(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('Cancelled all scheduled notifications');
  }

  async scheduleReminder(
    cadence: NotificationCadence,
    hour: number,
    minute: number,
    weekday: number = 1,
  ): Promise<void> {
    if (Platform.OS === 'web') return;

    await this.cancelAll();

    if (cadence === 'none') {
      return;
    }

    const hasPermission = await this.checkPermissions();
    if (!hasPermission) {
      logger.warn('Cannot schedule notification: permissions not granted');
      return;
    }

    const title = AppConfig.strings.settings.notifications.reminderTitle;
    const body = AppConfig.strings.settings.notifications.reminderBody;
    const channelId = 'default';

    let trigger: Notifications.NotificationTriggerInput = null;

    if (Platform.OS === 'ios') {
      const calendarTrigger: any = {
        type: 'calendar',
        hour,
        minute,
        repeats: true,
      };

      if (cadence === 'weekly') {
        calendarTrigger.weekday = weekday;
      }

      trigger = calendarTrigger;
    } else {
      if (cadence === 'daily') {
        trigger = {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        } as Notifications.DailyTriggerInput;
      } else {
        trigger = {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
        } as Notifications.WeeklyTriggerInput;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...Platform.select({
          android: { channelId } as any,
          default: {},
        }),
      },
      trigger,
    });

    logger.info(
      `Scheduled ${cadence} reminder at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} (weekday: ${weekday})`,
    );
  }

  async sendImmediateTest(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: AppConfig.strings.settings.notifications.testTitle,
        body: AppConfig.strings.settings.notifications.testBody,
        ...Platform.select({
          android: { channelId: 'default' } as any,
          default: {},
        }),
      },
      trigger: null,
    });
  }

  /**
   * Calculates "Safe-to-Spend" based on liquid assets minus remaining budgets for the month.
   */
  private safeToSpendByWorkplace = new Map<string, Observable<SafeToSpendResult>>();

  observeSafeToSpend(
    workplaceId: WorkplaceId,
    defaultCurrencyCode: string,
  ): Observable<SafeToSpendResult> {
    const cached = this.safeToSpendByWorkplace.get(workplaceId);
    if (cached) {
      return cached;
    }

    const obs = combineLatest([preferences.observe('safeToSpendDays')]).pipe(
      switchMap(([safeToSpendDays]) => {
        return combineLatest([
          accountRepository.observeByType(workplaceId, AccountType.ASSET),
          accountRepository.observeByType(workplaceId, AccountType.LIABILITY),
          budgetRepository.observeAllActive(workplaceId),
          plannedPaymentRepository.observeActive(workplaceId),
          accountRepository.observeAll(workplaceId),
          journalRepository.observePlannedInRange(
            workplaceId,
            dayjs().subtract(safeToSpendDays, 'day').startOf('day').valueOf(),
            dayjs().add(safeToSpendDays, 'day').endOf('day').valueOf(),
          ),
          transactionRepository.observeActiveWithColumns(workplaceId, ['running_balance']),
          journalRepository.observeStatusMeta(workplaceId),
        ] as [
          Observable<Account[]>,
          Observable<Account[]>,
          Observable<Budget[]>,
          Observable<PlannedPayment[]>,
          Observable<Account[]>,
          Observable<Journal[]>,
          Observable<unknown[]>,
          Observable<Journal[]>,
        ]).pipe(
          map(([assets, liabilities, budgets, plannedPayments, allAccounts, plannedJournals]) => ({
            assets,
            liabilities,
            budgets,
            plannedPayments,
            allAccounts,
            plannedJournals,
            safeToSpendDays,
            defaultCurrencyCode,
            workplaceId,
          })),
        );
      }),
      debounceTime(AppConfig.insights.observeDebounceMs),
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

          // Fetch historical deltas as part of the simulation flow
          const history$ = from(
            transactionRawRepository.getDailyDeltasGroupedRaw(
              workplaceId,
              liquidAssetIds,
              lookbackDate,
              startOfToday.valueOf() + AppConfig.time.msPerDay,
            ),
          );

          // Use injected resultCurrency

          if (liquidAssets.length === 0) {
            const empty: SafeToSpendResult = {
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
              currencyCode: defaultCurrencyCode,
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
            return of(empty);
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
              // Phase 1: Normalized balance fetch (includes hierarchy rollups and exclusions)
              const allBalances = await balanceService.getAccountBalances(
                workplaceId,
                now.valueOf(),
                defaultCurrencyCode,
              );
              const balancesMapByAccountId = new Map(
                allBalances.map(b => [b.accountId, b.balance]),
              );

              // P0 Perf: Pre-warm exchange rates once, then use sync getRateSafe()
              // Replaces N sequential await convert() calls across RN bridge
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
              await Promise.all(
                Array.from(uniqueBaseCurrencies).map(base =>
                  exchangeRateService.fetchRatesForBase(base).catch(() => ({})),
                ),
              );

              const startingBalances = new Map<AccountId, number>();
              let totalLiquidAssetsAmount = 0;

              const liquidAssetAccounts: { name: string; amount: number }[] = [];
              for (const a of liquidAssets) {
                const balance = balancesMapByAccountId.get(a.id) || 0;
                totalLiquidAssetsAmount += balance;
                liquidAssetAccounts.push({ name: a.name, amount: balance });
                startingBalances.set(a.id, balance);
              }

              const totalLiquidMoney = Money.from(totalLiquidAssetsAmount, defaultCurrencyCode);

              const liquidLiabilityAccounts: { name: string; amount: number }[] = [];
              const liabilityAccountBalances = liquidLiabilities.map(l => {
                const balance = Math.abs(balancesMapByAccountId.get(l.id) || 0);
                liquidLiabilityAccounts.push({ name: l.name, amount: balance });
                return {
                  account: l,
                  balance,
                };
              });

              // Call the simulation engine
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
              );

              // Calculate History Points (UI concern)
              // P1 Perf: Use sync getRateSafe() — rates already pre-warmed above
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
                // Points are at the END of each day (Start of targetDay is the same as End of targetDay - 1)
                historyPoints.push({
                  timestamp: targetDay - 1000, // 23:59:59 of the previous day
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

              return {
                summary: {
                  ...runResult.simulationResult.summary,
                  ...runResult.report.summary,
                  safeCurrentBalance: totalLiquidMoney.amount, // Added for UI validation
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
            }),
            catchError(err => {
              logger.error('[SafeToSpend] Error in simulation pipeline:', err);
              // Return an empty/fallback result instead of letting the observable die
              return of(this.getEmptySafeToSpendResult(defaultCurrencyCode));
            }),
          );
        },
      ),
      catchError(err => {
        logger.error('[SafeToSpend] Outer pipeline error:', err);
        return of(this.getEmptySafeToSpendResult(defaultCurrencyCode));
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.safeToSpendByWorkplace.set(workplaceId, obs);
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

export const notificationService = new NotificationService();
