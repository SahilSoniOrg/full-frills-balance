import { AppConfig } from '@/src/constants';
import Account, { AccountSubcategory, AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { RecurringPattern } from '@/src/data/repositories/TransactionTypes';
import { balanceService } from '@/src/services/BalanceService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
    isLiquidAssetSubcategory,
    isLiquidLiabilitySubcategory,
    LIQUID_ASSET_SUBCATEGORIES,
    LIQUID_LIABILITY_SUBCATEGORIES
} from '@/src/utils/accountSubcategoryUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { BehaviorSubject, combineLatest, Observable, of, timer } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';

const DEFAULT_INSIGHTS_CONFIG = {
    lookbackDays: 90,
    minRecurringIntervalDays: 25,
    maxRecurringIntervalDays: 35,
    minAnnualRecurringIntervalDays: 360,
    maxAnnualRecurringIntervalDays: 370,
    minRecurringCount: 3,
    spendingSpikeMultiplier: 1.5,
    spendingSpikeSeverityThreshold: 1000,
    spikeWindowDays: 7,
} as const;

export interface SafeToSpendDataPoint {
    timestamp: number;
    value: number;
    isProjected: boolean;
}

export interface SafeToSpendProjection {
    history: SafeToSpendDataPoint[];
    projection: SafeToSpendDataPoint[];
    safeDaysCount: number | null;
}

export interface SafeToSpendResult {
    totalLiquidAssets: number;
    totalLiabilities: number;
    committedBudget: number;
    committedRecurring: number;
    committedPlanned: number;
    safeToSpend: number;
    currencyCode: string;
    liquidAssetSubcategories: AccountSubcategory[];
    liquidLiabilitySubcategories: AccountSubcategory[];
    budgetSubcategories: AccountSubcategory[];
    recurringSubcategories: AccountSubcategory[];
    liquidAssetAccountNames: string[];
    liquidLiabilityAccountNames: string[];
    budgetAccountNames: string[];
    recurringAccountNames: string[];
    liquidAssetAccountIds: string[];
    liquidLiabilityAccountIds: string[];
    dailyBudgetBurn: number;
    /** Transient: IDs of EXPENSE accounts covered by an active budget. Used to exclude them from historical avgBurn. */
    budgetCoveredExpenseAccountIds?: Set<string>;
    projection?: SafeToSpendProjection;
}

export interface Pattern {
    id: string;
    type: 'slow-leak' | 'phantom-surplus' | 'subscription-amnesiac' | 'lifestyle-drift';
    severity: 'low' | 'medium' | 'high';
    message: string;
    description: string;
    suggestion: string;
    journalIds: string[];
    amount?: number;
    currencyCode?: string;
    accountSubcategory?: AccountSubcategory;
    accountName?: string;
}

export class InsightService {
    private refreshTrigger = new BehaviorSubject<void>(undefined);

    /**
     * Calculates "Safe-to-Spend" based on liquid assets minus remaining budgets for the month.
     */
    observeSafeToSpend(): Observable<SafeToSpendResult> {
        return combineLatest([
            accountRepository.observeByType(AccountType.ASSET),
            accountRepository.observeByType(AccountType.LIABILITY),
            budgetRepository.observeAllActive(),
            plannedPaymentRepository.observeActive(),
            accountRepository.observeAll(),
            journalRepository.observePlannedForMonth(dayjs().format('YYYY-MM')),
            // BalanceService derives from running_balance + active journal status;
            // observe both so safe-to-spend refreshes after async rebuild/status-only updates.
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
            debounceTime(250),
            switchMap(([assets, liabilities, budgets, plannedPayments, allAccounts, plannedJournals]) => {
                // Build the set of account IDs that act as group/parent containers.
                // Their balance is a pseudo-aggregated sum — not real money — so they must
                // be excluded from all liquid-cash calculations.
                const parentIds = new Set<string>(
                    allAccounts.map(a => a.parentAccountId).filter((id): id is string => Boolean(id))
                );

                const liquidAssets = assets.filter(a =>
                    isLiquidAssetSubcategory(a.accountSubcategory) && !parentIds.has(a.id)
                );
                const liquidLiabilities = liabilities.filter(l =>
                    isLiquidLiabilitySubcategory(l.accountSubcategory) && !parentIds.has(l.id)
                );

                if (liquidAssets.length === 0) {
                    return of({
                        totalLiquidAssets: 0,
                        totalLiabilities: 0,
                        committedBudget: 0,
                        committedRecurring: 0,
                        committedPlanned: 0,
                        safeToSpend: 0,
                        currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
                        liquidAssetSubcategories: [...LIQUID_ASSET_SUBCATEGORIES],
                        liquidLiabilitySubcategories: [...LIQUID_LIABILITY_SUBCATEGORIES],
                        budgetSubcategories: [],
                        recurringSubcategories: [],
                        liquidAssetAccountNames: [],
                        liquidLiabilityAccountNames: [],
                        budgetAccountNames: [],
                        recurringAccountNames: [],
                        liquidAssetAccountIds: [],
                        liquidLiabilityAccountIds: [],
                        dailyBudgetBurn: 0,
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

                        let totalLiabilities = 0;
                        liquidLiabilities.forEach(l => {
                            const b = accountBalances.find(bal => bal.accountId === l.id);
                            if (b) totalLiabilities += Math.abs(b.balance);
                        });

                        // Only count budgets that belong to the current month.
                        const currentMonth = dayjs().format('YYYY-MM');
                        const today = dayjs();
                        const daysLeftInMonth = today.daysInMonth() - today.date() + 1; // inclusive of today
                        const scopeGroups = budgetScopeGroups as any[][];

                        // Convert each current-month budget's remaining to resultCurrency, then
                        // derive a per-day burn rate (remaining / daysLeftInMonth).
                        // This turns the lump-sum budget into a steady daily depletion.
                        let dailyBudgetBurn = 0;
                        let remainingBudget = 0;

                        await Promise.all(
                            (usages as any[]).map(async (usage, idx) => {
                                const budget = budgets[idx];
                                if (budget.startMonth !== currentMonth) return;
                                const remaining = Math.max(0, usage.remaining);
                                if (remaining === 0) return;
                                const budgetCurrency = budget.currencyCode || resultCurrency;
                                let remainingInDefault = remaining;
                                if (budgetCurrency !== resultCurrency) {
                                    try {
                                        const { convertedAmount } = await exchangeRateService.convert(
                                            remaining, budgetCurrency, resultCurrency
                                        );
                                        remainingInDefault = convertedAmount;
                                    } catch (e) {
                                        logger.error('Failed to convert budget remaining for safe-to-spend', e);
                                    }
                                }
                                remainingBudget += remainingInDefault;
                                dailyBudgetBurn += remainingInDefault / Math.max(1, daysLeftInMonth);
                            })
                        );

                        // Build the set of expense account IDs covered by current-month budget scopes
                        // so we don't double-count planned payments that already fall under a budget.
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

                        const netCash = totalLiquid - totalLiabilities;

                        // 30-day cash flow simulation:
                        // Each day the balance depletes by dailyBudgetBurn. On specific days,
                        // planned payments inject (income) or withdraw (expense) amounts.
                        // Safe to Spend = the minimum the balance ever reaches in the window.
                        // If no budgets exist, fall back to avgBurn for a sensible baseline.
                        const safeToSpend = await this.simulateSafeToSpend(
                            netCash,
                            dailyBudgetBurn,
                            plannedPayments,
                            plannedJournals,
                            liquidAssetIds,
                            liquidLiabilityIds,
                            budgetCoveredExpenseAccountIds,
                            resultCurrency,
                        );

                        const budgetSubcategories = Array.from(
                            new Set(
                                scopeGroups
                                    .flatMap(scopes => scopes)
                                    .map((scope: any) => accountById.get(scope.account.id)?.accountSubcategory)
                                    .filter((subcategory): subcategory is AccountSubcategory => Boolean(subcategory))
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
                            committedBudget: remainingBudget,
                            committedRecurring: 0, // Removed: managed via planned payments
                            committedPlanned: 0,   // Absorbed into simulation
                            safeToSpend,
                            currencyCode: resultCurrency,
                            liquidAssetSubcategories: [...LIQUID_ASSET_SUBCATEGORIES],
                            liquidLiabilitySubcategories: [...LIQUID_LIABILITY_SUBCATEGORIES],
                            budgetSubcategories,
                            recurringSubcategories: [],
                            liquidAssetAccountNames,
                            liquidLiabilityAccountNames,
                            budgetAccountNames,
                            recurringAccountNames: [],
                            liquidAssetAccountIds: liquidAssetIds,
                            liquidLiabilityAccountIds: liquidLiabilityIds,
                            dailyBudgetBurn,
                            budgetCoveredExpenseAccountIds,
                        };
                    })
                );
            })
        );
    }

    /**
     * Calculates Safe-to-Spend and appends 30-day historical and 100-day projected data.
     */
    observeSafeToSpendProjection(): Observable<SafeToSpendResult> {
        return this.observeSafeToSpend().pipe(
            switchMap(async (current) => {
                if (current.safeToSpend === 0 && current.totalLiquidAssets === 0) {
                    current.projection = { history: [], projection: [], safeDaysCount: null };
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
        const thirtyDaysAgo = now.subtract(30, 'day').valueOf();

        // 1. History (Past 30 days)
        const activeAccountsIds = [...current.liquidAssetAccountIds, ...current.liquidLiabilityAccountIds];
        const rawDeltas = await transactionRawRepository.getDailyDeltasGroupedRaw(activeAccountsIds, thirtyDaysAgo, now.valueOf() + 86400000);

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

            const isLiability = delta.accountType === AccountType.LIABILITY;
            const effectiveDelta = isLiability ? -amount : amount;

            const localDayStart = dayjs(delta.dayStart).startOf('day').valueOf();
            netCashFlowByDay.set(localDayStart, (netCashFlowByDay.get(localDayStart) || 0) + effectiveDelta);
        }

        const historyPoints: SafeToSpendDataPoint[] = [];
        let runningBalance = current.totalLiquidAssets - current.totalLiabilities;

        historyPoints.push({
            timestamp: now.valueOf(),
            value: runningBalance,
            isProjected: false
        });

        for (let i = 0; i < 30; i++) {
            const targetDay = now.subtract(i, 'day').valueOf();
            const flowThatDay = netCashFlowByDay.get(targetDay) || 0;
            runningBalance -= flowThatDay;

            historyPoints.push({
                timestamp: now.subtract(i + 1, 'day').valueOf(),
                value: runningBalance,
                isProjected: false
            });
        }
        historyPoints.reverse();

        // 2. Average Burn Rate (non-budgeted accounts only)
        // Budget-covered accounts use the precise dailyBudgetBurn from the simulation.
        // Including them in the historical average would double-count their projected cost.
        const allExpenseAccs = await accountRepository.findByType(AccountType.EXPENSE);
        const nonBudgetedExpenseAccs = allExpenseAccs.filter(a => !budgetCoveredExpenseAccountIds.has(a.id));
        const expenseDeltas = await transactionRawRepository.getDailyDeltasGroupedRaw(
            nonBudgetedExpenseAccs.map(a => a.id), thirtyDaysAgo, now.valueOf() + 86400000
        );

        const dailyExpenses = new Map<number, number>();
        for (const delta of expenseDeltas) {
            let amount = delta.delta;
            if (delta.currencyCode !== current.currencyCode) {
                try {
                    const { convertedAmount } = await exchangeRateService.convert(amount, delta.currencyCode, current.currencyCode);
                    amount = convertedAmount;
                } catch (e) { }
            }
            const localDayStart = dayjs(delta.dayStart).startOf('day').valueOf();
            dailyExpenses.set(localDayStart, (dailyExpenses.get(localDayStart) || 0) + Math.abs(amount));
        }

        const expenseValues = Array.from(dailyExpenses.values()).filter(v => v > 0);
        let avgBurnNonBudgeted = 0;
        if (expenseValues.length > 0) {
            expenseValues.sort((a, b) => a - b);
            const p90Index = Math.floor(expenseValues.length * 0.9);
            const normalExpenses = expenseValues.slice(0, p90Index); // exclude big spikes
            const normalSum = normalExpenses.reduce((a, b) => a + b, 0);
            avgBurnNonBudgeted = normalSum / 30;
        }

        // Total projected daily drain:
        //   dailyBudgetBurn  = precise committed daily spend for budgeted accounts
        //   avgBurnNonBudgeted = historical average for everything else
        const totalDailyDrain = (current.dailyBudgetBurn ?? 0) + avgBurnNonBudgeted;

        // 3. Future Projection (100 days)
        const futureDays = 100;
        const projectionPoints: SafeToSpendDataPoint[] = [];
        let projectedAmount = current.totalLiquidAssets - current.totalLiabilities;

        const plannedPayments = await plannedPaymentRepository.findAllActive();
        const plannedImpactByDay = new Map<number, number>();
        const nowMs = now.valueOf();
        const endMs = now.add(futureDays, 'day').valueOf();

        for (const pp of plannedPayments) {
            let curr = pp.nextOccurrence;
            while (curr <= endMs) {
                if (curr > nowMs) {
                    const occurrenceDayStart = dayjs(curr).startOf('day').valueOf();
                    let amount = pp.amount;
                    if (pp.currencyCode !== current.currencyCode) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(pp.amount, pp.currencyCode, current.currencyCode);
                            amount = convertedAmount;
                        } catch (e) { }
                    }

                    const isLiquidSource = current.liquidAssetAccountIds.includes(pp.fromAccountId) || current.liquidLiabilityAccountIds.includes(pp.fromAccountId);
                    const isLiquidDest = current.liquidAssetAccountIds.includes(pp.toAccountId) || current.liquidLiabilityAccountIds.includes(pp.toAccountId);

                    let impact = 0;
                    if (isLiquidSource) impact -= amount;
                    if (isLiquidDest) impact += amount;

                    if (impact !== 0) {
                        plannedImpactByDay.set(occurrenceDayStart, (plannedImpactByDay.get(occurrenceDayStart) || 0) + impact);
                    }
                }

                if (pp.intervalType === 'DAILY') curr = dayjs(curr).add(pp.intervalN || 1, 'day').valueOf();
                else if (pp.intervalType === 'WEEKLY') curr = dayjs(curr).add(pp.intervalN || 1, 'week').valueOf();
                else if (pp.intervalType === 'MONTHLY') curr = dayjs(curr).add(pp.intervalN || 1, 'month').valueOf();
                else if (pp.intervalType === 'YEARLY') curr = dayjs(curr).add(pp.intervalN || 1, 'year').valueOf();
                else break; // Fallback to avoid infinite loops
            }
        }

        const plannedJournals = await journalRepository.journalsQuery(
            Q.where('status', JournalStatus.PLANNED),
            Q.where('journal_date', Q.gt(nowMs)),
            Q.where('journal_date', Q.lte(endMs)),
            Q.where('deleted_at', Q.eq(null))
        ).fetch();

        if (plannedJournals.length > 0) {
            const plannedJournalIds = plannedJournals.map(j => j.id);
            const plannedTxs = await transactionRepository.findByJournals(plannedJournalIds);

            for (const tx of plannedTxs) {
                const journal = plannedJournals.find(j => j.id === tx.journalId);
                if (!journal) continue;

                const isLiquidAcc = current.liquidAssetAccountIds.includes(tx.accountId) || current.liquidLiabilityAccountIds.includes(tx.accountId);
                if (!isLiquidAcc) continue;

                const occurrenceDayStart = dayjs(journal.journalDate).startOf('day').valueOf();

                let amount = tx.amount;
                if (tx.currencyCode !== current.currencyCode) {
                    try {
                        const { convertedAmount } = await exchangeRateService.convert(amount, tx.currencyCode, current.currencyCode);
                        amount = convertedAmount;
                    } catch (e) { }
                }

                // DEBIT increases Net Cash, CREDIT decreases Net Cash
                const impact = tx.transactionType === TransactionType.DEBIT ? amount : -amount;

                plannedImpactByDay.set(occurrenceDayStart, (plannedImpactByDay.get(occurrenceDayStart) || 0) + impact);
            }
        }

        let safeDaysCount: number | null = null;

        projectionPoints.push({
            timestamp: now.valueOf(),
            value: projectedAmount,
            isProjected: true
        });

        for (let i = 1; i <= futureDays; i++) {
            const targetDayStart = now.add(i, 'day').valueOf();
            // Prefer the simulation-derived burn rate; fall back to historical avgBurn
            const dailyDrain = totalDailyDrain;
            projectedAmount -= dailyDrain;
            const plannedImpact = plannedImpactByDay.get(targetDayStart) || 0;
            projectedAmount += plannedImpact;

            projectionPoints.push({
                timestamp: targetDayStart,
                value: projectedAmount,
                isProjected: true
            });

            if (projectedAmount < 0 && safeDaysCount === null) {
                safeDaysCount = i;
            }
        }

        return {
            history: historyPoints,
            projection: projectionPoints.slice(0, 31), // Return 30 future days for the graph
            safeDaysCount
        };
    }

    /**
     * Real pattern detection logic.
     * Analyzes transaction history for recurring payments and spending spikes.
     */
    observeDismissedPatterns(): Observable<Pattern[]> {
        return this.observePatternsInternal(true);
    }

    observePatterns(): Observable<Pattern[]> {
        return this.observePatternsInternal(false);
    }

    private observePatternsInternal(onlyDismissed: boolean): Observable<Pattern[]> {
        const insightsConfig = AppConfig.insights ?? DEFAULT_INSIGHTS_CONFIG;
        const lookbackDays = insightsConfig.lookbackDays;

        // F-08 Fix: Recalculate ninetyDaysAgo periodically (e.g. every hour) so the
        // reactive window doesn't go stale in long-lived app sessions.
        // We use a timer that fires immediately and then every hour.
        const oneHour = 60 * 60 * 1000;

        return timer(0, oneHour).pipe(
            switchMap(() => {
                const ninetyDaysAgo = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);

                return combineLatest([
                    transactionRepository.observeByDateRange(ninetyDaysAgo),
                    accountRepository.observeAll(),
                    plannedPaymentRepository.observeActive(), // For deduplication against planned payments
                    this.refreshTrigger,
                    of(ninetyDaysAgo)
                ]);
            }),
            debounceTime(500),
            switchMap(async ([_, accounts, activePlannedPayments, __, ninetyDaysAgo]) => {
                const accountMap = new Map((accounts as Account[]).map((a: Account) => [a.id, a]));
                const minCount = insightsConfig.minRecurringCount;

                // 1. Subscription Amnesia Detection (SQL-optimized)
                const recurringCandidates: RecurringPattern[] = await transactionRawRepository.getRecurringPatternsRaw(
                    ninetyDaysAgo as number,
                    minCount
                );
                const patterns: Pattern[] = [];

                for (const candidate of recurringCandidates) {
                    const acc = accountMap.get(candidate.accountId);
                    if (acc?.accountType !== AccountType.EXPENSE) continue;

                    // Fetch the actual transactions for this candidate group more precisely 
                    // to validate intervals. This is still O(1) queries per pattern vs O(N) globally.
                    const journalIds = (candidate.journalIds || '').split(',');
                    const transactions = await transactionRepository.findByJournals(journalIds);

                    transactions.sort((a, b) => a.transactionDate - b.transactionDate);
                    const intervals = [];
                    for (let i = 1; i < transactions.length; i++) {
                        intervals.push(transactions[i].transactionDate - transactions[i - 1].transactionDate);
                    }

                    const isRecurring = intervals.every(interval => {
                        const days = interval / (24 * 60 * 60 * 1000);
                        const minD = insightsConfig.minRecurringIntervalDays;
                        const maxD = insightsConfig.maxRecurringIntervalDays;
                        const minA = insightsConfig.minAnnualRecurringIntervalDays;
                        const maxA = insightsConfig.maxAnnualRecurringIntervalDays;
                        return (days >= minD && days <= maxD) || (days >= minA && days <= maxA);
                    });

                    if (isRecurring) {
                        const amount = Math.abs(candidate.amount);
                        const accountName = acc.name || 'Unknown Spending';
                        const formattedAmount = CurrencyFormatter.format(amount, candidate.currencyCode);

                        patterns.push({
                            id: `sub_${candidate.amount}_${candidate.accountId}`,
                            type: 'subscription-amnesiac',
                            severity: amount > insightsConfig.spendingSpikeSeverityThreshold ? 'high' : 'medium',
                            message: 'Subscription Amnesia',
                            description: `You have a recurring payment of ${formattedAmount} in "${accountName}".`,
                            suggestion: 'Review this regular expense to see if it still provides value.',
                            journalIds: journalIds,
                            amount,
                            currencyCode: candidate.currencyCode,
                            accountSubcategory: acc.accountSubcategory,
                            accountName,
                        });
                    }
                }

                // 2. Slow Leak Detection (Temporary fallback to in-memory)
                // For slow leak, we still need recent transactions to compare against history.
                // We'll fetch only the transactions we need for the spike window + historical baseline.
                const spikeWindow = insightsConfig.spikeWindowDays;
                const last7Days = Date.now() - (spikeWindow * 24 * 60 * 60 * 1000);

                // Fetch only expense transactions for lookback window
                const expenseTransactions = await transactionRepository.findByAccountsAndDateRange(
                    (accounts as Account[]).filter((a: Account) => a.accountType === AccountType.EXPENSE).map((a: Account) => a.id),
                    ninetyDaysAgo as number,
                    Date.now()
                );

                // Deduplicate subscription patterns against manual Planned Payments
                const finalPatterns = patterns.filter((p: Pattern) => {
                    if (p.type !== 'subscription-amnesiac') return true;
                    // Check if there's an active planned payment for this account name and approximate amount
                    const account = accounts.find((a: Account) => a.name === p.accountName);
                    if (!account) return true;

                    const isAlreadyPlanned = activePlannedPayments.some((pp: PlannedPayment) =>
                        Math.abs(pp.amount) === Math.abs(p.amount || 0) &&
                        (pp.fromAccountId === account.id || pp.toAccountId === account.id)
                    );
                    return !isAlreadyPlanned;
                });

                // 2. Slow Leak Detection (Spike in spending categories)
                const currentWeekTransactions = expenseTransactions.filter(t => t.transactionDate >= last7Days);
                const previousWeeksTransactions = expenseTransactions.filter(t => t.transactionDate < last7Days);

                // Group by subcategory to catch spending across multiple checking/credit cards
                const currentWeekBySubcategory = new Map<string, number>();
                currentWeekTransactions.forEach(t => {
                    const acc = accountMap.get(t.accountId);
                    const subcat = acc?.accountSubcategory || 'UNKNOWN';
                    currentWeekBySubcategory.set(subcat, (currentWeekBySubcategory.get(subcat) || 0) + Math.abs(t.amount));
                });

                const totalBySubcategory = new Map<string, number>();
                previousWeeksTransactions.forEach(t => {
                    const acc = accountMap.get(t.accountId);
                    const subcat = acc?.accountSubcategory || 'UNKNOWN';
                    totalBySubcategory.set(subcat, (totalBySubcategory.get(subcat) || 0) + Math.abs(t.amount));
                });

                currentWeekBySubcategory.forEach((amount, subcategory) => {
                    const historyTotal = totalBySubcategory.get(subcategory) || 0;

                    // M-2 fix: derive the actual number of *previous* weeks from the oldest
                    // transaction timestamp in history, rather than hardcoding 12.
                    // If we have fewer than MIN_WEEKS of history the baseline is unreliable —
                    // skip the comparison to avoid noisy false-positives.
                    const MIN_WEEKS = 4;
                    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
                    const historicalTxs = previousWeeksTransactions.filter(
                        t => accountMap.get(t.accountId)?.accountSubcategory === subcategory
                    );
                    const oldestDate = historicalTxs.length > 0
                        ? Math.min(...historicalTxs.map(t => t.transactionDate))
                        : null;
                    const weeksOfHistory = oldestDate
                        ? Math.max(1, (last7Days - oldestDate) / WEEK_MS)
                        : 0;

                    if (weeksOfHistory < MIN_WEEKS) return; // Not enough history for a reliable baseline

                    const historyAverage = historyTotal / weeksOfHistory;

                    const spikeMultiplier = insightsConfig.spendingSpikeMultiplier;
                    if (historyAverage > 0 && amount > historyAverage * spikeMultiplier) {
                        const formattedSubcategory = subcategory.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                        finalPatterns.push({
                            id: `leak_${subcategory}`,
                            type: 'slow-leak',
                            severity: 'low',
                            message: 'Spending Spike',
                            description: `Spending on "${formattedSubcategory}" is 50% higher than your weekly average.`,
                            suggestion: 'Check your recent activity in this category for any unusual spends.',
                            journalIds: Array.from(new Set(currentWeekTransactions.filter(t => accountMap.get(t.accountId)?.accountSubcategory === subcategory).map(t => t.journalId)))
                        });
                    }
                });

                // 3. Asset Allocation & Emergency Fund Insights
                const assets = accounts.filter(a => a.accountType === AccountType.ASSET);
                if (assets.length > 0) {
                    // We need balances to evaluate asset allocation. 
                    // To avoid making this observable asynchronous and blocking everything, 
                    // we'll rely on the existing balance logic or skip it if we can't get it synchronously here.
                    // Actually, the pattern observation is already asynchronous/switchMap heavy.
                    // For now, let's keep it simple: we just highlight if they have NO emergency fund account
                    const hasEmergencyFund = assets.some(a => a.accountSubcategory === 'EMERGENCY_FUND');
                    const hasSignificantAssets = assets.length > 3; // Rough proxy for "established user"

                    if (!hasEmergencyFund && hasSignificantAssets) {
                        finalPatterns.push({
                            id: `no_emergency_fund`,
                            type: 'lifestyle-drift', // Repurposing classification for now
                            severity: 'medium',
                            message: 'No Emergency Fund',
                            description: `You don't have a dedicated account for emergencies.`,
                            suggestion: 'Consider creating an "Emergency Fund" asset account to track savings meant for unexpected expenses.',
                            journalIds: []
                        });
                    }
                }

                const dismissedIds = preferences.dismissedPatternIds;
                if (onlyDismissed) {
                    return finalPatterns.filter(p => dismissedIds.includes(p.id));
                }
                return finalPatterns.filter(p => !dismissedIds.includes(p.id));
            })
        );
    }

    /**
     * Dismisses a specific pattern.
     */
    async dismissPattern(id: string): Promise<void> {
        await preferences.dismissPattern(id);
        this.refreshTrigger.next();
    }

    async undismissPattern(id: string): Promise<void> {
        await preferences.undismissPattern(id);
        this.refreshTrigger.next();
    }

    /**
     * 30-day cash flow simulation for Safe to Spend.
     *
     * Algorithm:
     *   balance[0] = netCash
     *   balance[d] = balance[d-1] − dailyBudgetBurn + plannedInflow[d] − plannedOutflow[d]
     *
     *   safeToSpend = max(0, min(balance[0..30]))
     *
     * This is the maximum amount you can front-load today while guaranteeing the
     * projected balance never goes negative over the next 30 days.
     *
     * Income detection: a PlannedPayment is income when money flows INTO a liquid account
     * from a non-liquid account (e.g. INCOME account → CHECKING). It is an expense when
     * it flows OUT of a liquid account to a non-liquid account. Liquid→liquid is a transfer
     * and has no net impact.
     *
     * Budget-covered flows: planned payments whose destination is a budget-covered expense
     * account are excluded — the daily budget burn already accounts for that spending.
     *
     * Fallback: if no active budgets exist (dailyBudgetBurn == 0) and there are no planned
     * payments, falls back to avgBurn from the past 30 days for a non-zero baseline.
     */
    private async simulateSafeToSpend(
        netCash: number,
        dailyBudgetBurn: number,
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAssetIds: string[],
        liquidLiabilityIds: string[],
        budgetCoveredExpenseAccountIds: Set<string>,
        resultCurrency: string,
    ): Promise<number> {
        const now = dayjs().startOf('day');
        const SIMULATION_DAYS = 30;
        const liquidAccountIds = new Set<string>([...liquidAssetIds, ...liquidLiabilityIds]);

        // ── Build day-indexed cash flow map ──────────────────────────────────────
        // Key: number of days offset from today (1..30)
        const flowByDayOffset = new Map<number, number>();

        const addFlow = (dayOffset: number, amount: number) => {
            if (dayOffset < 1 || dayOffset > SIMULATION_DAYS) return;
            flowByDayOffset.set(dayOffset, (flowByDayOffset.get(dayOffset) || 0) + amount);
        };

        // -- Planned Payments (recurring / one-shot with nextOccurrence) ----------
        const nowMs = now.valueOf();
        const endMs = now.add(SIMULATION_DAYS, 'day').valueOf();

        // Track which planned-payment IDs already have a PLANNED journal this month
        // (the journal is the authoritative entry, skip the PP itself for those)
        const journalCoveredPPIds = new Set<string>(
            plannedJournals
                .map(pj => pj.plannedPaymentId)
                .filter((id): id is string => Boolean(id))
        );

        for (const pp of plannedPayments) {
            // Skip if already covered by a planned journal (would double-count)
            if (journalCoveredPPIds.has(pp.id)) continue;
            // Skip budget-covered expense flows
            if (budgetCoveredExpenseAccountIds.has(pp.toAccountId)) continue;

            const isLiquidFrom = liquidAccountIds.has(pp.fromAccountId);
            const isLiquidTo = liquidAccountIds.has(pp.toAccountId);
            // Skip liquid→liquid transfers (neutral to net cash)
            if (isLiquidFrom && isLiquidTo) continue;
            // If neither side is liquid, this PP is irrelevant to safe-to-spend
            if (!isLiquidFrom && !isLiquidTo) continue;

            // Walk all occurrences within the window
            let curr = pp.nextOccurrence;
            while (curr <= endMs) {
                if (curr > nowMs) {
                    const dayOffset = dayjs(curr).startOf('day').diff(now, 'day');
                    let amount = pp.amount;
                    if (pp.currencyCode && pp.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(
                                amount, pp.currencyCode, resultCurrency
                            );
                            amount = convertedAmount;
                        } catch (e) { /* use unconverted as fallback */ }
                    }
                    // Income: non-liquid → liquid (+), Expense: liquid → non-liquid (−)
                    const impact = isLiquidTo ? amount : -amount;
                    addFlow(dayOffset, impact);
                }

                // Advance to next occurrence
                if (pp.intervalType === 'DAILY') curr = dayjs(curr).add(pp.intervalN || 1, 'day').valueOf();
                else if (pp.intervalType === 'WEEKLY') curr = dayjs(curr).add(pp.intervalN || 1, 'week').valueOf();
                else if (pp.intervalType === 'MONTHLY') curr = dayjs(curr).add(pp.intervalN || 1, 'month').valueOf();
                else if (pp.intervalType === 'YEARLY') curr = dayjs(curr).add(pp.intervalN || 1, 'year').valueOf();
                else break;
            }
        }

        // -- Planned Journals (manually scheduled future entries) -----------------
        // These represent commitments that already exist as double-entry records.
        // We only count the legs that touch liquid accounts.
        if (plannedJournals.length > 0) {
            const plannedJournalIds = plannedJournals.map(j => j.id);
            try {
                const plannedTxs = await transactionRepository.findByJournals(plannedJournalIds);
                for (const tx of plannedTxs) {
                    const journal = plannedJournals.find(j => j.id === tx.journalId);
                    if (!journal) continue;
                    if (!liquidAccountIds.has(tx.accountId)) continue;
                    const occurrenceMs = journal.journalDate;
                    if (occurrenceMs <= nowMs || occurrenceMs > endMs) continue;

                    const dayOffset = dayjs(occurrenceMs).startOf('day').diff(now, 'day');
                    let amount = tx.amount;
                    if (tx.currencyCode && tx.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(
                                amount, tx.currencyCode, resultCurrency
                            );
                            amount = convertedAmount;
                        } catch (e) { /* fallback to unconverted */ }
                    }
                    // DEBIT = money coming into account (+), CREDIT = money leaving (−)
                    const impact = tx.transactionType === TransactionType.DEBIT ? amount : -amount;
                    addFlow(dayOffset, impact);
                }
            } catch (e) {
                logger.error('simulateSafeToSpend: failed to fetch planned journal transactions', e);
            }
        }

        // ── Daily burn = budget burn (exact) + historical avg for non-budgeted accounts ──
        // We ALWAYS compute the non-budgeted avg, whether or not budgets exist.
        // Without this, adding a small budget (e.g. ₹4k/month) would replace the full
        // historical burn with just ₹149/day, inflating Safe to Spend by ~₹100k+.
        let avgBurnNonBudgeted = 0;
        try {
            const thirtyDaysAgo = now.subtract(30, 'day').valueOf();
            const allExpenseAccs = await accountRepository.findByType(AccountType.EXPENSE);
            const nonBudgetedAccs = allExpenseAccs.filter(a => !budgetCoveredExpenseAccountIds.has(a.id));
            if (nonBudgetedAccs.length > 0) {
                const expenseDeltas = await transactionRawRepository.getDailyDeltasGroupedRaw(
                    nonBudgetedAccs.map(a => a.id), thirtyDaysAgo, now.valueOf() + 86400000
                );
                const dailyExpenses = new Map<number, number>();
                for (const delta of expenseDeltas) {
                    let amount = delta.delta;
                    if (delta.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(amount, delta.currencyCode, resultCurrency);
                            amount = convertedAmount;
                        } catch (e) { /* fallback */ }
                    }
                    const dayKey = dayjs(delta.dayStart).startOf('day').valueOf();
                    dailyExpenses.set(dayKey, (dailyExpenses.get(dayKey) || 0) + Math.abs(amount));
                }
                // p90 trim: exclude the top 10% spike days so one-off large expenses
                // (rent, insurance, etc.) don't inflate the projected daily burn.
                const expenseValues = Array.from(dailyExpenses.values()).filter(v => v > 0);
                if (expenseValues.length > 0) {
                    expenseValues.sort((a, b) => a - b);
                    const p90Index = Math.floor(expenseValues.length * 0.9);
                    const trimmed = expenseValues.slice(0, p90Index);
                    const trimmedSum = trimmed.reduce((a, b) => a + b, 0);
                    avgBurnNonBudgeted = trimmedSum / 30;
                }
            }
        } catch (e) {
            logger.error('simulateSafeToSpend: failed to compute avgBurnNonBudgeted', e);
        }

        // Total effective daily drain:
        //   dailyBudgetBurn     = precise remaining budget ÷ days left (0 if no budget)
        //   avgBurnNonBudgeted  = 30-day historical average for unbudgeted categories
        const effectiveDailyBurn = dailyBudgetBurn + avgBurnNonBudgeted;

        // ── Simulate 30 days ──────────────────────────────────────────────────────
        let balance = netCash;
        let minBalance = netCash;

        for (let d = 1; d <= SIMULATION_DAYS; d++) {
            balance -= effectiveDailyBurn;
            balance += flowByDayOffset.get(d) || 0;
            if (balance < minBalance) minBalance = balance;
        }

        // The minimum projected balance is the maximum safe withdrawal today.
        return Math.max(0, minBalance);
    }
}

export const insightService = new InsightService();
