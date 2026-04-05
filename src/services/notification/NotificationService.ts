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
import { balanceService } from '@/src/services/BalanceService';
import { budgetReadService, BudgetUsage } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
  isLiquidAssetSubtype,
  isLiquidLiabilitySubtype,
  LIQUID_ASSET_SUBTYPES,
} from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import dayjs from 'dayjs';
import { combineLatest, from, Observable, of } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { Insight, insightService } from '../insight/InsightService';
import { cashFlowSimulationService } from '../simulation/CashFlowSimulationService';

import { FlowType, SimulationResult } from '../simulation/types';

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

export interface SafeToSpendResult extends SimulationResult {
  totalLiquidAssets: number;
  currencyCode: string;
  liquidAssetSubtypes: AccountSubtype[];
  liquidAssetAccounts: { name: string; amount: number }[];
  liquidLiabilityAccounts: { name: string; amount: number }[];
  liquidAssetAccountIds: string[];
  liquidLiabilityAccountIds: string[];
  dailyBudgetBurn: number;
  projection: SafeToSpendProjection;
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
  observeSafeToSpend(): Observable<SafeToSpendResult> {
    const safeToSpendDays = AppConfig.defaults.safeToSpendDays;

    return combineLatest([
      accountRepository.observeByType(AccountType.ASSET),
      accountRepository.observeByType(AccountType.LIABILITY),
      budgetRepository.observeAllActive(),
      plannedPaymentRepository.observeActive(),
      accountRepository.observeAll(),
      journalRepository.observePlannedInRange(
        dayjs().startOf('day').valueOf(),
        dayjs().add(safeToSpendDays, 'day').endOf('day').valueOf(),
      ),
      transactionRepository.observeActiveWithColumns(['running_balance']),
      journalRepository.observeStatusMeta(),
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
      debounceTime(AppConfig.insights.observeDebounceMs),
      switchMap(([assets, liabilities, budgets, plannedPayments, allAccounts, plannedJournals]) => {
        const now = dayjs().startOf('day');
        const thirtyDaysAgo = now.subtract(safeToSpendDays, 'day').valueOf();

        const parentIds = new Set<string>(
          allAccounts.map(a => a.parentAccountId).filter((id): id is string => Boolean(id)),
        );

        const liquidAssets = assets.filter(
          a => isLiquidAssetSubtype(a.accountSubtype) && !parentIds.has(a.id),
        );
        const liquidLiabilities = liabilities.filter(
          l => isLiquidLiabilitySubtype(l.accountSubtype) && !parentIds.has(l.id),
        );

        const liquidAssetIds = liquidAssets.map(a => a.id);
        const liquidLiabilityIds = liquidLiabilities.map(l => l.id);

        // Fetch historical deltas as part of the simulation flow
        const history$ = from(
          transactionRawRepository.getDailyDeltasGroupedRaw(
            liquidAssetIds,
            thirtyDaysAgo,
            now.valueOf() + AppConfig.time.msPerDay,
          ),
        );

        const resultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        if (liquidAssets.length === 0) {
          const empty: SafeToSpendResult = {
            summary: {
              safeToSpend: 0,
              shortfall: 0,
              trajectoryMinBalance: 0,
              safeDaysCount: null,
              totalFutureInflow: 0,
              totalOrganicInflow: 0,
              totalOrganicOutflow: 0,
              totalCommittedPlanned: 0,
              firstMajorInflowDay: null,
            },
            breakdowns: {
              committed: [],
              debt: [],
              income: [],
              budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 0 },
              liabilities: {
                total: 0,
                totalCreditCard: 0,
                totalOther: 0,
                committed: 0,
                committedCreditCard: 0,
                committedOther: 0,
              },
            },
            projections: {
              points: [],
              dailyBudgetBurns: [],
              flowByDayOffset: new Map(),
              safeToSpendDailyBreakdown: new Map(),
            },
            metadata: {
              firstMajorInflowDay: null,
              committedSubtypes: [],
              debtSubtypes: [],
            },
            totalLiquidAssets: 0,
            currencyCode: resultCurrency,
            liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
            liquidAssetAccounts: [],
            liquidLiabilityAccounts: [],
            liquidAssetAccountIds: [],
            liquidLiabilityAccountIds: [],
            dailyBudgetBurn: 0,
            projection: { history: [], projection: [], safeDaysCount: null, safeToSpend: 0 },
          };
          return of(empty);
        }

        const budgetUsageObservables = budgets.map(b => budgetReadService.observeBudgetUsage(b));
        const budgetScopeObservables = budgets.map(b => budgetRepository.observeScopes(b.id));

        const budgetUsage$ =
          budgetUsageObservables.length > 0
            ? combineLatest(budgetUsageObservables)
            : of([] as BudgetUsage[]);
        const budgetScopes$ =
          budgetScopeObservables.length > 0
            ? combineLatest(budgetScopeObservables)
            : of([] as any[][]);

        return combineLatest([budgetUsage$, budgetScopes$, history$]).pipe(
          switchMap(async ([usages, budgetScopeGroups, rawDeltas]) => {
            const accountBalances = await balanceService.getAccountBalances();

            const targetMoney = Money.from(0, resultCurrency);
            let totalLiquidMoney = targetMoney;
            const liquidAssetAccounts: { name: string; amount: number }[] = [];
            for (const a of liquidAssets) {
              const b = accountBalances.find(bal => bal.accountId === a.id);
              if (b) {
                let amount = b.balance;
                if (b.currencyCode !== resultCurrency) {
                  const { convertedAmount } = await exchangeRateService.convert(
                    b.balance,
                    b.currencyCode,
                    resultCurrency,
                  );
                  amount = convertedAmount;
                }
                totalLiquidMoney = totalLiquidMoney.add(Money.from(amount, resultCurrency));
                liquidAssetAccounts.push({ name: a.name, amount });
              }
            }

            const liquidLiabilityAccounts: { name: string; amount: number }[] = [];
            const liabilityAccountBalances = await Promise.all(
              liquidLiabilities.map(async l => {
                const b = accountBalances.find(bal => bal.accountId === l.id);
                let balance = Math.abs(b?.balance || 0);
                if (b && b.currencyCode !== resultCurrency) {
                  const { convertedAmount } = await exchangeRateService.convert(
                    balance,
                    b.currencyCode,
                    resultCurrency,
                  );
                  balance = convertedAmount;
                }
                liquidLiabilityAccounts.push({ name: l.name, amount: balance });
                return {
                  account: l,
                  balance,
                };
              }),
            );

            const simulationResults = await cashFlowSimulationService.simulateSafeToSpend(
              totalLiquidMoney.amount,
              plannedPayments,
              plannedJournals,
              [...liquidAssetIds, ...liquidLiabilityIds],
              liabilityAccountBalances,
              budgets,
              usages,
              budgetScopeGroups,
              allAccounts,
              resultCurrency,
            );

            // Calculate History Points
            const netCashFlowByDay = new Map<number, number>();
            const deltas = rawDeltas || [];
            for (const delta of deltas) {
              let amount = delta.delta;
              if (delta.currencyCode !== resultCurrency) {
                try {
                  const { convertedAmount } = await exchangeRateService.convert(
                    amount,
                    delta.currencyCode,
                    resultCurrency,
                  );
                  amount = convertedAmount;
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
            historyPoints.push({
              timestamp: now.valueOf(),
              value: runningBalance,
              isProjected: false,
            });

            for (let i = 0; i < safeToSpendDays; i++) {
              const targetDay = now.subtract(i, 'day').valueOf();
              const flowThatDay = netCashFlowByDay.get(targetDay) || 0;
              runningBalance -= flowThatDay;
              historyPoints.push({
                timestamp: now.subtract(i + 1, 'day').valueOf(),
                value: runningBalance,
                isProjected: false,
              });
            }
            historyPoints.reverse();

            const projection: SafeToSpendProjection = {
              history: historyPoints,
              projection: simulationResults.projections.points,
              safeDaysCount: simulationResults.summary.safeDaysCount,
              safeToSpend: simulationResults.summary.safeToSpend,
            };

            return {
              ...simulationResults,
              totalLiquidAssets: totalLiquidMoney.amount,
              currencyCode: resultCurrency,
              liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
              liquidAssetAccounts,
              liquidLiabilityAccounts,
              liquidAssetAccountIds: liquidAssetIds,
              liquidLiabilityAccountIds: liquidLiabilityIds,
              dailyBudgetBurn:
                simulationResults.breakdowns.budget.currentMonthRemaining /
                Math.max(1, AppConfig.defaults.safeToSpendDays), // Rough estimate
              projection,
            };
          }),
        );
      }),
    );
  }
}

export const notificationService = new NotificationService();
