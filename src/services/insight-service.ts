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
            this.observePatterns(),
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
                Observable<Pattern[]>,
                Observable<Account[]>,
                Observable<Journal[]>,
                Observable<unknown[]>,
                Observable<Journal[]>
            ]
        ).pipe(
            debounceTime(250),
            switchMap(([assets, liabilities, budgets, plannedPayments, patterns, allAccounts, plannedJournals]) => {
                const liquidAssets = assets.filter(a => isLiquidAssetSubcategory(a.accountSubcategory));
                const liquidLiabilities = liabilities.filter(l => isLiquidLiabilitySubcategory(l.accountSubcategory));

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

                        const committedRecurring = await this.calculateCommittedRecurring(patterns, resultCurrency);
                        const committedPlanned = await this.calculateCommittedPlanned(plannedPayments, plannedJournals, resultCurrency);

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

                        const remainingBudget = (usages as any[]).reduce((acc, curr) => acc + Math.max(0, curr.remaining), 0);
                        const netCash = totalLiquid - totalLiabilities;
                        const safeToSpend = netCash - remainingBudget - committedRecurring - committedPlanned;

                        const scopeGroups = budgetScopeGroups as any[];
                        const budgetSubcategories = Array.from(
                            new Set(
                                scopeGroups
                                    .flatMap(scopes => scopes)
                                    .map(scope => accountById.get(scope.account.id)?.accountSubcategory)
                                    .filter((subcategory): subcategory is AccountSubcategory => Boolean(subcategory))
                            )
                        );

                        const recurringSubcategories = Array.from(
                            new Set(
                                patterns
                                    .filter(pattern => pattern.type === 'subscription-amnesiac')
                                    .map(pattern => pattern.accountSubcategory)
                                    .filter((subcategory): subcategory is AccountSubcategory => Boolean(subcategory))
                            )
                        );
                        const liquidAssetAccountNames = Array.from(new Set(liquidAssets.map(a => a.name)));
                        const liquidLiabilityAccountNames = Array.from(new Set(liquidLiabilities.map(l => l.name)));
                        const budgetAccountNames = Array.from(
                            new Set(
                                scopeGroups
                                    .flatMap(scopes => scopes)
                                    .map(scope => accountById.get(scope.account.id)?.name)
                                    .filter((name): name is string => Boolean(name))
                            )
                        );
                        const recurringAccountNames = Array.from(
                            new Set(
                                patterns
                                    .filter(pattern => pattern.type === 'subscription-amnesiac')
                                    .map(pattern => pattern.accountName)
                                    .filter((name): name is string => Boolean(name))
                            )
                        );

                        return {
                            totalLiquidAssets: totalLiquid,
                            totalLiabilities,
                            committedBudget: remainingBudget,
                            committedRecurring,
                            committedPlanned,
                            safeToSpend: Math.max(0, safeToSpend),
                            currencyCode: resultCurrency,
                            liquidAssetSubcategories: [...LIQUID_ASSET_SUBCATEGORIES],
                            liquidLiabilitySubcategories: [...LIQUID_LIABILITY_SUBCATEGORIES],
                            budgetSubcategories,
                            recurringSubcategories,
                            liquidAssetAccountNames,
                            liquidLiabilityAccountNames,
                            budgetAccountNames,
                            recurringAccountNames,
                            liquidAssetAccountIds: liquidAssets.map(a => a.id),
                            liquidLiabilityAccountIds: liquidLiabilities.map(l => l.id),
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
                const projection = await this.calculateSafeToSpendProjection(current);
                return { ...current, projection };
            })
        );
    }

    private async calculateSafeToSpendProjection(current: SafeToSpendResult): Promise<SafeToSpendProjection> {
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

        // 2. Average Burn Rate
        const expenseAccs = await accountRepository.findByType(AccountType.EXPENSE);
        const expenseDeltas = await transactionRawRepository.getDailyDeltasGroupedRaw(expenseAccs.map(a => a.id), thirtyDaysAgo, now.valueOf() + 86400000);

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
        let avgBurn = 0;
        if (expenseValues.length > 0) {
            expenseValues.sort((a, b) => a - b);
            const p90Index = Math.floor(expenseValues.length * 0.9);
            const normalExpenses = expenseValues.slice(0, p90Index); // exclude big spikes
            const normalSum = normalExpenses.reduce((a, b) => a + b, 0);
            avgBurn = normalSum / 30; // average over the 30 day period
        }

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
            projectedAmount -= avgBurn;
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

    private async calculateCommittedRecurring(patterns: Pattern[], resultCurrency: string): Promise<number> {
        const recurringConversions = await Promise.all(
            patterns
                .filter(p => p.type === 'subscription-amnesiac')
                .map(async p => {
                    if (!p.amount || !p.currencyCode || p.currencyCode === resultCurrency) return p.amount || 0;
                    try {
                        const { convertedAmount } = await exchangeRateService.convert(p.amount, p.currencyCode, resultCurrency);
                        return convertedAmount;
                    } catch (e) {
                        logger.error(`Failed to convert pattern amount for safe-to-spend`, e);
                        return p.amount;
                    }
                })
        );
        return recurringConversions.reduce((a, b) => a + b, 0);
    }

    private async calculateCommittedPlanned(
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        resultCurrency: string
    ): Promise<number> {
        const nowTime = Date.now();
        const endOfMonth = dayjs().endOf('month').valueOf();

        const plannedConversions = await Promise.all(
            plannedPayments
                .filter(pp => pp.nextOccurrence > nowTime && pp.nextOccurrence <= endOfMonth)
                .map(async pp => {
                    if (!pp.amount || !pp.currencyCode || pp.currencyCode === resultCurrency) return pp.amount || 0;
                    try {
                        const { convertedAmount } = await exchangeRateService.convert(pp.amount, pp.currencyCode, resultCurrency);
                        return convertedAmount;
                    } catch (e) {
                        logger.error(`Failed to convert planned payment amount for safe-to-spend`, e);
                        return pp.amount;
                    }
                })
        );
        const committedPlannedPayments = plannedConversions.reduce((a, b) => a + b, 0);

        const plannedJournalConversions = await Promise.all(
            plannedJournals.map(async pj => {
                if (!pj.totalAmount || !pj.currencyCode || pj.currencyCode === resultCurrency) return pj.totalAmount || 0;
                try {
                    const { convertedAmount } = await exchangeRateService.convert(pj.totalAmount, pj.currencyCode, resultCurrency);
                    return convertedAmount;
                } catch (e) {
                    logger.error(`Failed to convert planned journal amount for safe-to-spend`, e);
                    return pj.totalAmount;
                }
            })
        );
        const committedPlannedJournals = plannedJournalConversions.reduce((a, b) => a + b, 0);

        return committedPlannedPayments + committedPlannedJournals;
    }
}

export const insightService = new InsightService();
