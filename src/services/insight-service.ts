import { AppConfig } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
    isLiquidAssetSubtype,
    isLiquidLiabilitySubtype,
    LIQUID_ASSET_SUBTYPES,
    LIQUID_LIABILITY_SUBTYPES
} from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { combineLatest, Observable, of } from 'rxjs';
import { debounceTime, switchMap, take } from 'rxjs/operators';
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
    budgetCoveredExpenseAccountIds: Set<string>;
    committedAmountByAccount: {
        accountId: string,
        accountName: string,
        amount: number,
        budgets: { budgetId: string, name: string, amount: number }[]
    }[];
    projection?: SafeToSpendProjection;
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
                const parentIds = new Set<string>(
                    allAccounts.map(a => a.parentAccountId).filter((id): id is string => Boolean(id))
                );

                const liquidAssets = assets.filter(a =>
                    isLiquidAssetSubtype(a.accountSubtype) && !parentIds.has(a.id)
                );
                const liquidLiabilities = liabilities.filter(l =>
                    isLiquidLiabilitySubtype(l.accountSubtype) && !parentIds.has(l.id)
                );

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
                        budgetCoveredExpenseAccountIds: new Set<string>(),
                        committedAmountByAccount: [],
                    });
                }

                const resultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

                const budgetUsageObservables = budgets.map(b => budgetReadService.observeBudgetUsage(b));
                const budgetScopeObservables = budgets.map(b => budgetRepository.observeScopes(b.id));
                const accountById = new Map(allAccounts.map(account => [account.id, account]));

                const budgetUsage$ = budgetUsageObservables.length > 0 ? combineLatest(budgetUsageObservables) : of([]);
                const budgetScopes$ = budgetScopeObservables.length > 0 ? combineLatest(budgetScopeObservables) : of([]);

                return combineLatest([budgetUsage$, budgetScopes$]).pipe(
                    switchMap(async ([usages, budgetScopeGroups]) => {
                        const accountBalances = await balanceService.getAccountBalances();

                        const liquidAssetIds = liquidAssets.map(a => a.id);
                        const liquidLiabilityIds = liquidLiabilities.map(l => l.id);

                        let totalLiquid = 0;
                        liquidAssets.forEach(a => {
                            const b = accountBalances.find(bal => bal.accountId === a.id);
                            if (b) totalLiquid += b.balance;
                        });

                        // Only count budgets that belong to the current month.
                        const currentMonth = dayjs().format('YYYY-MM');
                        const today = dayjs();
                        const daysLeftInMonth = today.daysInMonth() - today.date() + 1; // inclusive of today
                        const scopeGroups = budgetScopeGroups as any[][];

                        let dailyBudgetBurnAvg = 0;
                        const simulationDays = AppConfig.defaults.safeToSpendDays;
                        const dailyBudgetBurns = new Array(simulationDays).fill(0);
                        const nextMonthDays = today.add(1, 'month').daysInMonth();

                        let currentMonthBudgetRemaining = 0;
                        let nextMonthBudgetProjected = 0;

                        // AccountID -> Daily burns for the 30-day projection
                        const accountMaxDailyBurns = new Map<string, number[]>();
                        // AccountID -> BudgetID -> Total contribution (before maxing)
                        const accountBudgetBuckets = new Map<string, Map<string, { name: string, amount: number }>>();

                        await Promise.all(
                            (usages as any[]).map(async (usage, idx) => {
                                const budget = budgets[idx];
                                if (budget.startMonth !== currentMonth) return;

                                const scope = (scopeGroups[idx] || []) as any[];
                                if (scope.length === 0) return;

                                const remaining = Math.max(0, usage.remaining);
                                if (remaining === 0 && budget.amount === 0) return;

                                const budgetCurrency = budget.currencyCode || resultCurrency;
                                let remainingInDefault = remaining;
                                let amountInDefault = budget.amount;

                                if (budgetCurrency !== resultCurrency) {
                                    try {
                                        const { convertedAmount: convRem } = await exchangeRateService.convert(
                                            remaining, budgetCurrency, resultCurrency
                                        );
                                        remainingInDefault = convRem;

                                        const { convertedAmount: convAmt } = await exchangeRateService.convert(
                                            budget.amount, budgetCurrency, resultCurrency
                                        );
                                        amountInDefault = convAmt;
                                    } catch (e) {
                                        logger.error('Failed to convert budget remaining for safe-to-spend', e);
                                    }
                                }

                                const currentMonthDaily = remainingInDefault / Math.max(1, daysLeftInMonth);
                                const nextMonthDaily = amountInDefault / Math.max(1, nextMonthDays);

                                const shareOfCurrent = currentMonthDaily / scope.length;
                                const shareOfNext = nextMonthDaily / scope.length;

                                for (const s of scope) {
                                    const accountId = s.account.id;
                                    let burns = accountMaxDailyBurns.get(accountId);
                                    if (!burns) {
                                        burns = new Array(simulationDays).fill(0);
                                        accountMaxDailyBurns.set(accountId, burns);
                                    }
                                    for (let i = 0; i < simulationDays; i++) {
                                        const dailyShare = i < daysLeftInMonth ? shareOfCurrent : shareOfNext;
                                        burns[i] = Math.max(burns[i], dailyShare);
                                    }

                                    // Track contribution for breakdown
                                    let accountBudgets = accountBudgetBuckets.get(accountId);
                                    if (!accountBudgets) {
                                        accountBudgets = new Map();
                                        accountBudgetBuckets.set(accountId, accountBudgets);
                                    }
                                    const totalContribution = (shareOfCurrent * daysLeftInMonth) + (shareOfNext * (simulationDays - daysLeftInMonth));
                                    accountBudgets.set(budget.id, { name: budget.name, amount: totalContribution });
                                }
                            })
                        );

                        // Finalize the daily budget burns
                        for (const burns of accountMaxDailyBurns.values()) {
                            for (let i = 0; i < simulationDays; i++) {
                                dailyBudgetBurns[i] += burns[i];
                            }
                        }

                        // Recalculate the subtotals from the finalized dailyBudgetBurns array for the UI breakdown
                        currentMonthBudgetRemaining = 0;
                        nextMonthBudgetProjected = 0;
                        for (let i = 0; i < simulationDays; i++) {
                            if (i < daysLeftInMonth) {
                                currentMonthBudgetRemaining += dailyBudgetBurns[i];
                            } else {
                                nextMonthBudgetProjected += dailyBudgetBurns[i];
                            }
                        }

                        // Ensure breakdown sums to total committed budget over simulationDays
                        const committedBudget = dailyBudgetBurns.reduce((sum, val) => sum + val, 0);
                        dailyBudgetBurnAvg = committedBudget / simulationDays;

                        const budgetCoveredExpenseAccountIds = new Set<string>();
                        for (let i = 0; i < budgets.length; i++) {
                            if (budgets[i].startMonth !== currentMonth) continue;
                            for (const scope of (scopeGroups[i] ?? [])) {
                                const acc = accountById.get((scope as any).account.id);
                                if (acc?.accountType === AccountType.EXPENSE) {
                                    budgetCoveredExpenseAccountIds.add((scope as any).account.id);
                                }
                            }
                        }

                        const liabilityAccountBalances = liquidLiabilities.map(l => ({
                            account: l,
                            balance: Math.abs(accountBalances.find(bal => bal.accountId === l.id)?.balance || 0)
                        }));

                        const {
                            safeToSpend,
                            totalFutureInflow,
                            committedPlanned,
                            committedPlannedPayments,
                            committedPlannedJournals,
                            committedLiabilities,
                            committedLiabilitiesCC,
                            committedLiabilitiesOther,
                            totalLiabilities,
                            totalLiabilitiesCC,
                            totalLiabilitiesOther
                        } = await cashFlowSimulationService.simulateSafeToSpend(
                            totalLiquid,
                            dailyBudgetBurns,
                            plannedPayments,
                            plannedJournals,
                            [...liquidAssetIds, ...liquidLiabilityIds],
                            liabilityAccountBalances,
                            budgetCoveredExpenseAccountIds,
                            resultCurrency,
                        );

                        const nextMonthProjectionDays = Math.max(0, simulationDays - daysLeftInMonth);

                        const budgetSubtypes = Array.from(
                            new Set(
                                scopeGroups
                                    .flatMap(scopes => scopes)
                                    .map((scope: any) => accountById.get(scope.account.id)?.accountSubtype)
                                    .filter((subtype): subtype is AccountSubtype => Boolean(subtype))
                            )
                        );

                        const liquidAssetAccountNames = Array.from(new Set(liquidAssets.map(a => a.name)));
                        const liquidLiabilityAccountNames = Array.from(new Set(liquidLiabilities.map(l => l.name)));
                        const budgetAccountNames = Array.from(
                            new Set(
                                scopeGroups
                                    .flatMap(scopes => scopes)
                                    .map((scope: any) => accountById.get(scope.account.id)?.name)
                                    .filter((name): name is string => Boolean(name))
                            )
                        );

                        return {
                            totalLiquidAssets: totalLiquid,
                            totalLiabilities,
                            totalLiabilitiesCC,
                            totalLiabilitiesOther,
                            dailyBudgetBurn: dailyBudgetBurnAvg,
                            dailyBudgetBurns,
                            currentMonthBudgetRemaining,
                            nextMonthBudgetProjected,
                            nextMonthProjectionDays,
                            committedBudget,
                            committedPlanned,
                            committedPlannedPayments,
                            committedPlannedJournals,
                            committedLiabilities,
                            committedLiabilitiesCC,
                            committedLiabilitiesOther,
                            totalFutureInflow,
                            safeToSpend,
                            currencyCode: resultCurrency,
                            liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
                            liquidLiabilitySubtypes: [...LIQUID_LIABILITY_SUBTYPES],
                            budgetSubtypes,
                            liquidAssetAccountNames,
                            liquidLiabilityAccountNames,
                            budgetAccountNames,
                            liquidAssetAccountIds: liquidAssetIds,
                            liquidLiabilityAccountIds: liquidLiabilityIds,
                            budgetCoveredExpenseAccountIds,
                            committedAmountByAccount: Array.from(accountMaxDailyBurns.entries())
                                .map(([accountId, burns]) => {
                                    const budgetsMap = accountBudgetBuckets.get(accountId);
                                    const budgetsList = budgetsMap ? Array.from(budgetsMap.entries()).map(([budgetId, b]) => ({
                                        budgetId,
                                        name: b.name,
                                        amount: b.amount
                                    })) : [];

                                    return {
                                        accountId,
                                        accountName: accountById.get(accountId)?.name || 'Unknown',
                                        amount: burns.reduce((sum, b) => sum + b, 0),
                                        budgets: budgetsList.sort((a, b) => b.amount - a.amount)
                                    };
                                })
                                .filter(a => a.amount > 0)
                                .sort((a, b) => b.amount - a.amount),
                        };
                    })
                );
            })
        );
    }

    /**
     * Calculates Safe-to-Spend and appends configured-day historical and projected data.
     */
    observeSafeToSpendProjection(): Observable<SafeToSpendResult> {
        return this.observeSafeToSpend().pipe(
            switchMap(async (current) => {
                if (current.safeToSpend === 0 && current.totalLiquidAssets === 0) {
                    current.projection = { history: [], projection: [], safeDaysCount: null, safeToSpend: 0 };
                    return current;
                }
                const projection = await this.calculateSafeToSpendProjection(
                    current,
                    current.budgetCoveredExpenseAccountIds,
                );
                return { ...current, projection };
            })
        );
    }

    private async calculateSafeToSpendProjection(
        current: SafeToSpendResult,
        budgetCoveredExpenseAccountIds: Set<string> = new Set(),
    ): Promise<SafeToSpendProjection> {
        const now = dayjs().startOf('day');
        const safeToSpendDays = AppConfig.defaults.safeToSpendDays;
        const thirtyDaysAgo = now.subtract(safeToSpendDays, 'day').valueOf();

        const activeAccountsIds = [...current.liquidAssetAccountIds];
        const rawDeltas = await transactionRawRepository.getDailyDeltasGroupedRaw(
            activeAccountsIds,
            thirtyDaysAgo,
            now.valueOf() + AppConfig.time.msPerDay
        );

        const netCashFlowByDay = new Map<number, number>();
        for (const delta of rawDeltas) {
            let amount = delta.delta;
            if (delta.currencyCode !== current.currencyCode) {
                try {
                    const { convertedAmount } = await exchangeRateService.convert(amount, delta.currencyCode, current.currencyCode);
                    amount = convertedAmount;
                } catch (e) {
                    logger.error("Failed to convert delta for history projection", e);
                }
            }
            const localDayStart = dayjs(delta.dayStart).startOf('day').valueOf();
            netCashFlowByDay.set(localDayStart, (netCashFlowByDay.get(localDayStart) || 0) + amount);
        }

        const historyPoints: SafeToSpendDataPoint[] = [];
        let runningBalance = current.totalLiquidAssets;

        historyPoints.push({ timestamp: now.valueOf(), value: runningBalance, isProjected: false });

        for (let i = 0; i < safeToSpendDays; i++) {
            const targetDay = now.subtract(i, 'day').valueOf();
            const flowThatDay = netCashFlowByDay.get(targetDay) || 0;
            runningBalance -= flowThatDay;
            historyPoints.push({ timestamp: now.subtract(i + 1, 'day').valueOf(), value: runningBalance, isProjected: false });
        }
        historyPoints.reverse();

        const simulationDays = safeToSpendDays;
        const liabilityAccounts = await accountRepository.observeByIds(current.liquidLiabilityAccountIds).pipe(take(1)).toPromise() || [];
        const accountBalances = await balanceService.getAccountBalances();
        const liabilityAccountBalances = liabilityAccounts.map(l => ({
            account: l,
            balance: Math.abs(accountBalances.find(bal => bal.accountId === l.id)?.balance || 0)
        }));

        const plannedPayments = await plannedPaymentRepository.findAllActive();
        const plannedJournals = await journalRepository.journalsQuery(
            Q.where('status', JournalStatus.PLANNED),
            Q.where('journal_date', Q.gte(now.valueOf())),
            Q.where('journal_date', Q.lte(now.add(simulationDays, 'day').valueOf())),
            Q.where('deleted_at', Q.eq(null))
        ).fetch();

        const { flowByDayOffset, effectiveDailyDrain } = await cashFlowSimulationService.getSimulationFlows(
            simulationDays, now, current.dailyBudgetBurns, plannedPayments, plannedJournals,
            new Set([...current.liquidAssetAccountIds, ...current.liquidLiabilityAccountIds]),
            liabilityAccountBalances, budgetCoveredExpenseAccountIds, current.currencyCode
        );

        const projectionPoints: SafeToSpendDataPoint[] = [];
        let projectedAmount = current.totalLiquidAssets;
        let minBalanceFound = projectedAmount;
        let safeDaysCount: number | null = null;

        projectionPoints.push({ timestamp: now.valueOf(), value: projectedAmount, isProjected: true });

        for (let d = 1; d <= simulationDays; d++) {
            const dailyDrain = Array.isArray(effectiveDailyDrain) ? (effectiveDailyDrain[d - 1] || 0) : effectiveDailyDrain;
            projectedAmount -= dailyDrain;
            projectedAmount += flowByDayOffset.get(d) || 0;
            projectionPoints.push({ timestamp: now.add(d, 'day').valueOf(), value: projectedAmount, isProjected: true });
            if (projectedAmount < minBalanceFound) minBalanceFound = projectedAmount;
            if (projectedAmount < 0 && safeDaysCount === null) safeDaysCount = d;
        }

        const safeToSpend = Math.max(0, minBalanceFound);

        return { history: historyPoints, projection: projectionPoints, safeDaysCount, safeToSpend };
    }

}

export const insightService = new InsightService();
