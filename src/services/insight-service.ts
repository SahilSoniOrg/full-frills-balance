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
    LIQUID_LIABILITY_SUBTYPES
} from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';

import dayjs from 'dayjs';
import { combineLatest, from, Observable, of } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { cashFlowSimulationService } from './insight/CashFlowSimulationService';
import { Pattern, patternService } from './insight/PatternService';

export { Pattern, patternService };

export interface SafeToSpendDataPoint {
    timestamp: number;
    value: number;
    isProjected: boolean;
}

export interface SafeToSpendProjection {
    history: SafeToSpendDataPoint[];
    projection: SafeToSpendDataPoint[];
    safeDaysCount: number | null;
    safeToSpend: number;
}

export interface SafeToSpendResult {
    totalLiquidAssets: number;
    totalLiabilities: number;
    totalLiabilitiesCC: number;
    totalLiabilitiesOther: number;
    committedBudget: number;
    committedPlanned: number;
    committedPlannedPayments: number;
    committedPlannedJournals: number;
    committedLiabilities: number;
    committedLiabilitiesCC: number;
    committedLiabilitiesOther: number;
    totalFutureInflow: number;
    safeToSpend: number;
    shortfall: number;
    currencyCode: string;
    liquidAssetSubtypes: AccountSubtype[];
    liquidLiabilitySubtypes: AccountSubtype[];
    budgetSubtypes: AccountSubtype[];
    liquidAssetAccountNames: string[];
    liquidLiabilityAccountNames: string[];
    budgetAccountNames: string[];
    liquidAssetAccountIds: string[];
    liquidLiabilityAccountIds: string[];
    dailyBudgetBurn: number;
    dailyBudgetBurns: number[];
    currentMonthBudgetRemaining: number;
    nextMonthBudgetProjected: number;
    nextMonthProjectionDays: number;
    committedAmountByAccount: {
        accountId: string,
        accountName: string,
        amount: number,
        budgets: { budgetId: string, name: string, amount: number }[]
    }[];
    projection: SafeToSpendProjection;
}

export class InsightService {
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
            journalRepository.observePlannedInRange(dayjs().startOf('day').valueOf(), dayjs().add(safeToSpendDays, 'day').endOf('day').valueOf()),
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
                Observable<Journal[]>
            ]
        ).pipe(
            debounceTime(AppConfig.insights.observeDebounceMs),
            switchMap(([assets, liabilities, budgets, plannedPayments, allAccounts, plannedJournals]) => {
                const now = dayjs().startOf('day');
                const thirtyDaysAgo = now.subtract(safeToSpendDays, 'day').valueOf();

                const parentIds = new Set<string>(
                    allAccounts.map(a => a.parentAccountId).filter((id): id is string => Boolean(id))
                );

                const liquidAssets = assets.filter(a =>
                    isLiquidAssetSubtype(a.accountSubtype) && !parentIds.has(a.id)
                );
                const liquidLiabilities = liabilities.filter(l =>
                    isLiquidLiabilitySubtype(l.accountSubtype) && !parentIds.has(l.id)
                );

                const liquidAssetIds = liquidAssets.map(a => a.id);
                const liquidLiabilityIds = liquidLiabilities.map(l => l.id);

                // Fetch historical deltas as part of the simulation flow
                const history$ = from(transactionRawRepository.getDailyDeltasGroupedRaw(
                    liquidAssetIds,
                    thirtyDaysAgo,
                    now.valueOf() + AppConfig.time.msPerDay
                ));

                if (liquidAssets.length === 0) {
                    return of({
                        totalLiquidAssets: 0,
                        totalLiabilities: 0,
                        totalLiabilitiesCC: 0,
                        totalLiabilitiesOther: 0,
                        committedBudget: 0,
                        committedPlanned: 0,
                        committedPlannedPayments: 0,
                        committedPlannedJournals: 0,
                        committedLiabilities: 0,
                        committedLiabilitiesCC: 0,
                        committedLiabilitiesOther: 0,
                        safeToSpend: 0,
                        shortfall: 0,
                        currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
                        liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
                        liquidLiabilitySubtypes: [...LIQUID_LIABILITY_SUBTYPES],
                        budgetSubtypes: [],
                        liquidAssetAccountNames: [],
                        liquidLiabilityAccountNames: [],
                        budgetAccountNames: [],
                        liquidAssetAccountIds: [],
                        liquidLiabilityAccountIds: [],
                        dailyBudgetBurn: 0,
                        dailyBudgetBurns: [],
                        currentMonthBudgetRemaining: 0,
                        nextMonthBudgetProjected: 0,
                        nextMonthProjectionDays: 0,
                        totalFutureInflow: 0,
                        committedAmountByAccount: [],
                        projection: { history: [], projection: [], safeDaysCount: null, safeToSpend: 0 },
                    });
                }

                const resultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

                const budgetUsageObservables = budgets.map(b => budgetReadService.observeBudgetUsage(b));
                const budgetScopeObservables = budgets.map(b => budgetRepository.observeScopes(b.id));

                const budgetUsage$ = budgetUsageObservables.length > 0 ? combineLatest(budgetUsageObservables) : of([] as BudgetUsage[]);
                const budgetScopes$ = budgetScopeObservables.length > 0 ? combineLatest(budgetScopeObservables) : of([] as any[][]);

                return combineLatest([budgetUsage$, budgetScopes$, history$]).pipe(
                    switchMap(async ([usages, budgetScopeGroups, rawDeltas]) => {
                        const accountBalances = await balanceService.getAccountBalances();

                        const targetMoney = Money.from(0, resultCurrency);
                        let totalLiquidMoney = targetMoney;
                        
                        for (const a of liquidAssets) {
                            const b = accountBalances.find(bal => bal.accountId === a.id);
                            if (b) {
                                let amount = b.balance;
                                if (b.currencyCode !== resultCurrency) {
                                    const { convertedAmount } = await exchangeRateService.convert(b.balance, b.currencyCode, resultCurrency);
                                    amount = convertedAmount;
                                }
                                totalLiquidMoney = totalLiquidMoney.add(Money.from(amount, resultCurrency));
                            }
                        }

                        const liabilityAccountBalances = await Promise.all(liquidLiabilities.map(async l => {
                            const b = accountBalances.find(bal => bal.accountId === l.id);
                            let balance = Math.abs(b?.balance || 0);
                            if (b && b.currencyCode !== resultCurrency) {
                                const { convertedAmount } = await exchangeRateService.convert(balance, b.currencyCode, resultCurrency);
                                balance = convertedAmount;
                            }
                            return {
                                account: l,
                                balance: Money.from(balance, resultCurrency)
                            };
                        }));

                        const simulationResults = await cashFlowSimulationService.simulateSafeToSpend(
                            totalLiquidMoney,
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
                                    const { convertedAmount } = await exchangeRateService.convert(amount, delta.currencyCode, resultCurrency);
                                    amount = convertedAmount;
                                } catch (e) {
                                    logger.error("Failed to convert delta for history projection", e);
                                }
                            }
                            const localDayStart = dayjs(delta.dayStart).startOf('day').valueOf();
                            netCashFlowByDay.set(localDayStart, (netCashFlowByDay.get(localDayStart) || 0) + amount);
                        }

                        const historyPoints: SafeToSpendDataPoint[] = [];
                        let runningBalance = totalLiquidMoney.amount;
                        historyPoints.push({ timestamp: now.valueOf(), value: runningBalance, isProjected: false });

                        for (let i = 0; i < safeToSpendDays; i++) {
                            const targetDay = now.subtract(i, 'day').valueOf();
                            const flowThatDay = netCashFlowByDay.get(targetDay) || 0;
                            runningBalance -= flowThatDay;
                            historyPoints.push({ timestamp: now.subtract(i + 1, 'day').valueOf(), value: runningBalance, isProjected: false });
                        }
                        historyPoints.reverse();

                        const projection: SafeToSpendProjection = {
                            history: historyPoints,
                            projection: simulationResults.projectionPoints,
                            safeDaysCount: simulationResults.safeDaysCount,
                            safeToSpend: simulationResults.safeToSpend
                        };

                        const scopes = budgetScopeGroups || [];
                        const budgetSubtypes = Array.from(
                            new Set(
                                scopes
                                    .flatMap(s => s)
                                    .map((scope: any) => allAccounts.find(a => a.id === scope.account.id)?.accountSubtype)
                                    .filter((subtype): subtype is AccountSubtype => Boolean(subtype))
                            )
                        );

                        const liquidAssetAccountNames = Array.from(new Set(liquidAssets.map(a => a.name)));
                        const liquidLiabilityAccountNames = Array.from(new Set(liquidLiabilities.map(l => l.name)));
                        const budgetAccountNames = Array.from(
                            new Set(
                                scopes
                                    .flatMap(s => s)
                                    .map((scope: any) => allAccounts.find(a => a.id === scope.account.id)?.name)
                                    .filter((name): name is string => Boolean(name))
                            )
                        );

                        return {
                            ...simulationResults,
                            totalLiquidAssets: totalLiquidMoney.amount,
                            currencyCode: resultCurrency,
                            liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
                            liquidLiabilitySubtypes: [...LIQUID_LIABILITY_SUBTYPES],
                            budgetSubtypes,
                            liquidAssetAccountNames,
                            liquidLiabilityAccountNames,
                            budgetAccountNames,
                            liquidAssetAccountIds: liquidAssetIds,
                            liquidLiabilityAccountIds: liquidLiabilityIds,
                            dailyBudgetBurn: simulationResults.committedBudget / Math.max(1, AppConfig.defaults.safeToSpendDays),
                            projection
                        };
                    })
                );
            })
        );
    }
}

export const insightService = new InsightService();
