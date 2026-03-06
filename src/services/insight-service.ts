import { AppConfig } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
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
    isLiquidAssetSubtype,
    isLiquidLiabilitySubtype,
    LIQUID_ASSET_SUBTYPES,
    LIQUID_LIABILITY_SUBTYPES
} from '@/src/utils/accountSubtypeUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { BehaviorSubject, combineLatest, Observable, of, timer } from 'rxjs';
import { debounceTime, switchMap, take } from 'rxjs/operators';

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
    totalFutureObligations: number;
    totalFutureInflow: number;
    safeToSpend: number;
    currencyCode: string;
    liquidAssetSubtypes: AccountSubtype[];
    liquidLiabilitySubtypes: AccountSubtype[];
    budgetSubtypes: AccountSubtype[];
    recurringSubtypes: AccountSubtype[];
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
    accountSubtype?: AccountSubtype;
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
            journalRepository.observePlannedInRange(dayjs().startOf('day').valueOf(), dayjs().add(30, 'day').endOf('day').valueOf()),
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
                    isLiquidAssetSubtype(a.accountSubtype) && !parentIds.has(a.id)
                );
                const liquidLiabilities = liabilities.filter(l =>
                    isLiquidLiabilitySubtype(l.accountSubtype) && !parentIds.has(l.id)
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
                        liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
                        liquidLiabilitySubtypes: [...LIQUID_LIABILITY_SUBTYPES],
                        budgetSubtypes: [],
                        recurringSubtypes: [],
                        liquidAssetAccountNames: [],
                        liquidLiabilityAccountNames: [],
                        budgetAccountNames: [],
                        recurringAccountNames: [],
                        liquidAssetAccountIds: [],
                        liquidLiabilityAccountIds: [],
                        dailyBudgetBurn: 0,
                        totalFutureObligations: 0,
                        totalFutureInflow: 0,
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

                        let currentLiabilitiesBalance = 0;
                        liquidLiabilities.forEach(l => {
                            const b = accountBalances.find(bal => bal.accountId === l.id);
                            if (b) currentLiabilitiesBalance += Math.abs(b.balance);
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

                        // 30-day cash flow simulation:
                        // Each day the balance depletes by dailyBudgetBurn. On specific days,
                        // planned payments inject (income) or withdraw (expense) amounts.
                        // Safe to Spend = the minimum the balance ever reaches in the window.
                        // If no budgets exist, fall back to avgBurn for a sensible baseline.
                        const liabilityAccountBalances = liquidLiabilities.map(l => ({
                            account: l,
                            balance: Math.abs(accountBalances.find(bal => bal.accountId === l.id)?.balance || 0)
                        }));

                        const {
                            safeToSpend,
                            totalFutureObligations,
                            totalFutureInflow,
                            committedPlanned,
                            totalLiabilities
                        } = await this.simulateSafeToSpend(
                            totalLiquid,
                            dailyBudgetBurn,
                            plannedPayments,
                            plannedJournals,
                            liquidAssetIds,
                            liabilityAccountBalances,
                            budgetCoveredExpenseAccountIds,
                            resultCurrency,
                        );

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
                            totalLiabilities: totalLiabilities,
                            committedBudget: remainingBudget,
                            committedRecurring: 0,
                            committedPlanned,
                            totalFutureObligations,
                            totalFutureInflow,
                            safeToSpend,
                            currencyCode: resultCurrency,
                            liquidAssetSubtypes: [...LIQUID_ASSET_SUBTYPES],
                            liquidLiabilitySubtypes: [...LIQUID_LIABILITY_SUBTYPES],
                            budgetSubtypes,
                            recurringSubtypes: [],
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

        // 1. History (Past 30 days) - Track Liquid Assets only for the "Cash Position" trajectory
        const activeAccountsIds = [...current.liquidAssetAccountIds];
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

            const effectiveDelta = amount; // Since we only track Assets here, delta is the flow.

            const localDayStart = dayjs(delta.dayStart).startOf('day').valueOf();
            netCashFlowByDay.set(localDayStart, (netCashFlowByDay.get(localDayStart) || 0) + effectiveDelta);
        }

        const historyPoints: SafeToSpendDataPoint[] = [];
        let runningBalance = current.totalLiquidAssets;

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

        // 2. Future Projection (30 days - unified via getSimulationFlows)
        const simulationDays = 30;
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

        const { flowByDayOffset, effectiveDailyDrain } = await this.getSimulationFlows(
            simulationDays,
            now,
            current.dailyBudgetBurn,
            plannedPayments,
            plannedJournals,
            new Set([...current.liquidAssetAccountIds, ...current.liquidLiabilityAccountIds]),
            liabilityAccountBalances,
            budgetCoveredExpenseAccountIds,
            current.currencyCode
        );

        const projectionPoints: SafeToSpendDataPoint[] = [];
        let projectedAmount = current.totalLiquidAssets;
        let minBalanceFound = projectedAmount;
        let safeDaysCount: number | null = null;

        projectionPoints.push({
            timestamp: now.valueOf(),
            value: projectedAmount,
            isProjected: true
        });

        for (let d = 1; d <= simulationDays; d++) {
            projectedAmount -= effectiveDailyDrain;
            projectedAmount += flowByDayOffset.get(d) || 0;

            const timestamp = now.add(d, 'day').valueOf();
            projectionPoints.push({
                timestamp,
                value: projectedAmount,
                isProjected: true
            });

            if (projectedAmount < minBalanceFound) {
                minBalanceFound = projectedAmount;
            }
            if (projectedAmount < 0 && safeDaysCount === null) {
                safeDaysCount = d;
            }
        }

        return {
            history: historyPoints,
            projection: projectionPoints,
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
                            accountSubtype: acc.accountSubtype,
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

                // Group by subtype to catch spending across multiple checking/credit cards
                const currentWeekBySubtype = new Map<string, number>();
                currentWeekTransactions.forEach(t => {
                    const acc = accountMap.get(t.accountId);
                    const subcat = acc?.accountSubtype || 'UNKNOWN';
                    currentWeekBySubtype.set(subcat, (currentWeekBySubtype.get(subcat) || 0) + Math.abs(t.amount));
                });

                const totalBySubtype = new Map<string, number>();
                previousWeeksTransactions.forEach(t => {
                    const acc = accountMap.get(t.accountId);
                    const subcat = acc?.accountSubtype || 'UNKNOWN';
                    totalBySubtype.set(subcat, (totalBySubtype.get(subcat) || 0) + Math.abs(t.amount));
                });

                currentWeekBySubtype.forEach((amount, subtype) => {
                    const historyTotal = totalBySubtype.get(subtype) || 0;

                    // M-2 fix: derive the actual number of *previous* weeks from the oldest
                    // transaction timestamp in history, rather than hardcoding 12.
                    // If we have fewer than MIN_WEEKS of history the baseline is unreliable —
                    // skip the comparison to avoid noisy false-positives.
                    const MIN_WEEKS = 4;
                    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
                    const historicalTxs = previousWeeksTransactions.filter(
                        t => accountMap.get(t.accountId)?.accountSubtype === subtype
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
                        const formattedSubtype = subtype.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                        finalPatterns.push({
                            id: `leak_${subtype}`,
                            type: 'slow-leak',
                            severity: 'low',
                            message: 'Spending Spike',
                            description: `Spending on "${formattedSubtype}" is 50% higher than your weekly average.`,
                            suggestion: 'Check your recent activity in this category for any unusual spends.',
                            journalIds: Array.from(new Set(currentWeekTransactions.filter(t => accountMap.get(t.accountId)?.accountSubtype === subtype).map(t => t.journalId)))
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
                    const hasEmergencyFund = assets.some(a => a.accountSubtype === 'EMERGENCY_FUND');
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
        startingBalance: number,
        dailyBudgetBurn: number,
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAssetIds: string[],
        liabilityAccountBalances: { account: Account, balance: number }[],
        budgetCoveredExpenseAccountIds: Set<string>,
        resultCurrency: string,
    ): Promise<{
        safeToSpend: number;
        totalFutureObligations: number;
        totalFutureInflow: number;
        committedPlanned: number;
        totalLiabilities: number;
    }> {
        const now = dayjs().startOf('day');
        const SIMULATION_DAYS = 30;

        const { flowByDayOffset, effectiveDailyDrain, totalFutureObligations, totalFutureInflow, committedPlanned, totalLiabilities } = await this.getSimulationFlows(
            SIMULATION_DAYS,
            now,
            dailyBudgetBurn,
            plannedPayments,
            plannedJournals,
            new Set([...liquidAssetIds, ...liabilityAccountBalances.map(l => l.account.id)]),
            liabilityAccountBalances,
            budgetCoveredExpenseAccountIds,
            resultCurrency
        );

        // ── Simulation Loop ──────────────────────────────────────────────────────
        let currentBalance = startingBalance;
        let minBalance = startingBalance;

        for (let d = 1; d <= SIMULATION_DAYS; d++) {
            currentBalance -= effectiveDailyDrain;
            currentBalance += flowByDayOffset.get(d) || 0;
            if (currentBalance < minBalance) minBalance = currentBalance;
        }

        return {
            safeToSpend: Math.max(0, minBalance),
            totalFutureObligations,
            totalFutureInflow,
            committedPlanned,
            totalLiabilities
        };
    }

    private async getSimulationFlows(
        simulationDays: number,
        now: dayjs.Dayjs,
        dailyBudgetBurn: number,
        plannedPayments: PlannedPayment[],
        plannedJournals: Journal[],
        liquidAccountIds: Set<string>,
        liabilityAccountBalances: { account: Account, balance: number }[],
        budgetCoveredExpenseAccountIds: Set<string>,
        resultCurrency: string,
    ): Promise<{
        flowByDayOffset: Map<number, number>,
        organicNetFlow: number,
        effectiveDailyDrain: number,
        totalFutureObligations: number,
        totalFutureInflow: number,
        committedPlanned: number,
        totalLiabilities: number
    }> {
        const flowByDayOffset = new Map<number, number>();
        let totalFutureObligations = 0;
        let totalFutureInflow = 0;
        let committedPlanned = 0;
        let totalLiabilitiesSum = 0;

        const addFlow = (dayOffset: number, amount: number, isPlanned = false) => {
            if (dayOffset < 0 || dayOffset > simulationDays) return; // Allow 0 (today)
            flowByDayOffset.set(dayOffset, (flowByDayOffset.get(dayOffset) || 0) + amount);
            if (amount < 0) totalFutureObligations += Math.abs(amount);
            if (amount > 0) totalFutureInflow += amount;
            if (isPlanned && amount < 0) committedPlanned += Math.abs(amount);
        };

        // 1. Daily Budget Drain
        // The balance changes each day by: -dailyBudgetBurn
        const effectiveDailyDrain = dailyBudgetBurn;

        // Add dailyBudgetBurn as an obligation for the full 30 days
        totalFutureObligations += Math.max(0, dailyBudgetBurn * simulationDays);

        // 2. Timed Liability Deductions
        // Find if any liability account is already covered by a manual planned payment or journal transaction
        const manualPaymentAccountIds = new Set<string>();
        for (const pp of plannedPayments) manualPaymentAccountIds.add(pp.toAccountId);
        if (plannedJournals.length > 0) {
            const plannedTxs = await transactionRepository.findByJournals(plannedJournals.map(j => j.id));
            for (const tx of plannedTxs) manualPaymentAccountIds.add(tx.accountId);
        }

        for (const { account, balance } of liabilityAccountBalances) {
            if (balance <= 0) continue;
            totalLiabilitiesSum += balance;

            // If there's a manual planned payment or journal for this account, 
            // the user wants us to skip the automated \"Timed Liability Deduction\".
            if (manualPaymentAccountIds.has(account.id)) {
                continue;
            }

            try {
                const metadataRecords = await account.metadataRecords.fetch();
                const metadata = metadataRecords[0];

                const today = now.date();
                const statementDay = metadata?.statementDay;
                const dueDay = metadata?.dueDay || 20;

                if (account.accountSubtype === AccountSubtype.CREDIT_CARD && statementDay) {
                    let deductionAmount = balance;
                    let targetDueDate: dayjs.Dayjs;

                    // Logic:
                    // If today <= statementDay: current balance will be part of the NEXT statement cycle.
                    // Wait, that's wrong. If today is 5th and statement is 15th, 
                    // the money I've spent so far WILL be on the statement on the 15th, due on the ~5th of NEXT month.
                    // If today is 20th and statement was 15th,
                    // the balance from the 15th is ALREADY on a statement, due on the ~5th of NEXT month.

                    if (today > statementDay) {
                        // We have a closed statement.
                        const statementDate = now.date(statementDay).startOf('day').valueOf();
                        const balancesAtStatement = await transactionRawRepository.getLatestBalancesRaw([account.id], statementDate);
                        const statementBalance = Math.abs(balancesAtStatement.get(account.id) || 0);

                        // Only deduct what was on the statement. Subsequent spending falls into the next cycle (beyond 30 days usually).
                        deductionAmount = statementBalance;

                        // targetDueDate is the next dueDay
                        targetDueDate = now.date(dueDay);
                        if (dueDay <= today) {
                            targetDueDate = targetDueDate.add(1, 'month');
                        }
                    } else {
                        // Statement hasn't closed yet. The entire current balance + future spending will be due 
                        // on the due Day of NEXT month cycle.
                        deductionAmount = balance;
                        targetDueDate = now.date(dueDay).add(1, 'month');
                    }

                    const dayOffset = targetDueDate.startOf('day').diff(now, 'day');
                    addFlow(dayOffset, -deductionAmount);
                } else {
                    // Loans, etc.
                    let deductionDay = metadata?.dueDay || metadata?.emiDay || 28;
                    let targetDate = now.date(deductionDay);
                    if (deductionDay <= today) {
                        targetDate = targetDate.add(1, 'month');
                    }
                    const dayOffset = targetDate.startOf('day').diff(now, 'day');
                    addFlow(dayOffset, -balance);
                }
            } catch (e) {
                logger.error('getSimulationFlows: liability metadata failed', e);
                addFlow(15, -balance);
            }
        }

        // 3. Planned Payments
        const endMs = now.add(simulationDays, 'day').valueOf();
        const nowMs = now.valueOf();
        const journalCoveredPPIds = new Set<string>(plannedJournals.map(pj => pj.plannedPaymentId).filter((id): id is string => Boolean(id)));

        for (const pp of plannedPayments) {
            if (journalCoveredPPIds.has(pp.id)) continue;
            if (budgetCoveredExpenseAccountIds.has(pp.toAccountId)) continue;

            const isLiquidFrom = liquidAccountIds.has(pp.fromAccountId);
            const isLiquidTo = liquidAccountIds.has(pp.toAccountId);
            if ((isLiquidFrom && isLiquidTo) || (!isLiquidFrom && !isLiquidTo)) continue;

            let curr = pp.nextOccurrence;
            while (curr <= endMs) {
                if (curr > nowMs) {
                    const dayOffset = dayjs(curr).startOf('day').diff(now, 'day');
                    let amount = pp.amount;
                    if (pp.currencyCode && pp.currencyCode !== resultCurrency) {
                        try {
                            const { convertedAmount } = await exchangeRateService.convert(amount, pp.currencyCode, resultCurrency);
                            amount = convertedAmount;
                        } catch (e) { }
                    }
                    const impact = isLiquidTo ? amount : -amount;
                    addFlow(dayOffset, impact, true);
                }
                if (pp.intervalType === 'DAILY') curr = dayjs(curr).add(pp.intervalN || 1, 'day').valueOf();
                else if (pp.intervalType === 'WEEKLY') curr = dayjs(curr).add(pp.intervalN || 1, 'week').valueOf();
                else if (pp.intervalType === 'MONTHLY') curr = dayjs(curr).add(pp.intervalN || 1, 'month').valueOf();
                else if (pp.intervalType === 'YEARLY') curr = dayjs(curr).add(pp.intervalN || 1, 'year').valueOf();
                else break;
            }
        }

        // 4. Planned Journals
        if (plannedJournals.length > 0) {
            const plannedTxs = await transactionRepository.findByJournals(plannedJournals.map(j => j.id));
            for (const tx of plannedTxs) {
                const journal = plannedJournals.find(j => j.id === tx.journalId);
                if (!journal || !liquidAccountIds.has(tx.accountId)) continue;
                const occurrenceMs = journal.journalDate;
                if (occurrenceMs <= nowMs || occurrenceMs > endMs) continue;

                const dayOffset = dayjs(occurrenceMs).startOf('day').diff(now, 'day');
                let amount = tx.amount;
                if (tx.currencyCode && tx.currencyCode !== resultCurrency) {
                    try {
                        const { convertedAmount } = await exchangeRateService.convert(amount, tx.currencyCode, resultCurrency);
                        amount = convertedAmount;
                    } catch (e) { }
                }
                const impact = tx.transactionType === TransactionType.DEBIT ? amount : -amount;
                addFlow(dayOffset, impact, true);
            }
        }

        return { flowByDayOffset, organicNetFlow: 0, effectiveDailyDrain, totalFutureObligations, totalFutureInflow, committedPlanned, totalLiabilities: totalLiabilitiesSum };
    }
}

export const insightService = new InsightService();
