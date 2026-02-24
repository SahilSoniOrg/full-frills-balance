import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { isLiquidAssetSubcategory, isLiquidLiabilitySubcategory } from '@/src/utils/accountSubcategoryUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { preferences } from '@/src/utils/preferences';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export interface SafeToSpendResult {
    totalLiquidAssets: number;
    totalLiabilities: number;
    committedBudget: number;
    committedRecurring: number;
    safeToSpend: number;
    currencyCode: string;
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
            this.observePatterns()
        ]).pipe(
            switchMap(([assets, liabilities, budgets, patterns]) => {
                const liquidAssets = assets.filter(a => isLiquidAssetSubcategory(a.accountSubcategory));
                const liquidLiabilities = liabilities.filter(l => isLiquidLiabilitySubcategory(l.accountSubcategory));

                if (liquidAssets.length === 0) {
                    return of({
                        totalLiquidAssets: 0,
                        totalLiabilities: 0,
                        committedBudget: 0,
                        committedRecurring: 0,
                        safeToSpend: 0,
                        currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency
                    });
                }

                const resultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

                const committedRecurring = patterns
                    .filter(p => p.type === 'subscription-amnesiac')
                    .reduce((sum, p) => sum + (p.amount || 0), 0);

                const budgetUsageObservables = budgets.map(b => budgetReadService.observeBudgetUsage(b));

                return (budgetUsageObservables.length > 0 ? combineLatest(budgetUsageObservables) : of([])).pipe(
                    switchMap(async (usages) => {
                        const accountBalances = await balanceService.getAccountBalances();

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

                        const remainingBudget = usages.reduce((acc, curr) => acc + Math.max(0, curr.remaining), 0);
                        const netCash = totalLiquid - totalLiabilities;

                        return {
                            totalLiquidAssets: totalLiquid,
                            totalLiabilities,
                            committedBudget: remainingBudget,
                            committedRecurring,
                            safeToSpend: Math.max(0, netCash - remainingBudget - committedRecurring),
                            currencyCode: resultCurrency
                        };
                    })
                );
            })
        );
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
        const lookbackDays = AppConfig.insights.lookbackDays;
        const ninetyDaysAgo = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);

        return combineLatest([
            transactionRepository.observeActive(),
            accountRepository.observeAll(),
            this.refreshTrigger
        ]).pipe(
            map(([transactions, accounts]) => {
                const accountMap = new Map(accounts.map(a => [a.id, a]));
                const recentTransactions = transactions.filter(t => t.transactionDate >= ninetyDaysAgo);

                const expenseTransactions = recentTransactions.filter(t => {
                    const acc = accountMap.get(t.accountId);
                    return acc?.accountType === AccountType.EXPENSE;
                });

                const patterns: Pattern[] = [];

                // 1. Subscription Amnesia Detection
                const expenseGroups = new Map<string, typeof expenseTransactions>();
                expenseTransactions.forEach(t => {
                    const key = `${Math.abs(t.amount)}_${t.accountId}`;
                    const group = expenseGroups.get(key) || [];
                    group.push(t);
                    expenseGroups.set(key, group);
                });

                expenseGroups.forEach((group, key) => {
                    const minCount = AppConfig.insights.minRecurringCount;
                    if (group.length >= minCount) {
                        group.sort((a, b) => a.transactionDate - b.transactionDate);
                        const intervals = [];
                        for (let i = 1; i < group.length; i++) {
                            intervals.push(group[i].transactionDate - group[i - 1].transactionDate);
                        }

                        const isRecurring = intervals.every(interval => {
                            const days = interval / (24 * 60 * 60 * 1000);
                            const minD = AppConfig.insights.minRecurringIntervalDays;
                            const maxD = AppConfig.insights.maxRecurringIntervalDays;
                            const minA = AppConfig.insights.minAnnualRecurringIntervalDays;
                            const maxA = AppConfig.insights.maxAnnualRecurringIntervalDays;
                            return (days >= minD && days <= maxD) || (days >= minA && days <= maxA);
                        });

                        if (isRecurring) {
                            const amount = Math.abs(group[0].amount);
                            const account = accountMap.get(group[0].accountId);
                            const accountName = account?.name || 'Unknown Spending';
                            const formattedAmount = CurrencyFormatter.format(amount, group[0].currencyCode);

                            patterns.push({
                                id: `sub_${key}`,
                                type: 'subscription-amnesiac',
                                severity: amount > AppConfig.insights.spendingSpikeSeverityThreshold ? 'high' : 'medium',
                                message: 'Subscription Amnesia',
                                description: `You have a recurring payment of ${formattedAmount} in "${accountName}".`,
                                suggestion: 'Review this regular expense to see if it still provides value.',
                                journalIds: Array.from(new Set(group.map(t => t.journalId))),
                                amount,
                                currencyCode: group[0].currencyCode
                            });
                        }
                    }
                });

                // 2. Slow Leak Detection (Spike in spending categories)
                const spikeWindow = AppConfig.insights.spikeWindowDays;
                const last7Days = Date.now() - (spikeWindow * 24 * 60 * 60 * 1000);
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
                    const historyAverage = historyTotal / 12; // TODO: Calculate actual week count or move to config

                    const spikeMultiplier = AppConfig.insights.spendingSpikeMultiplier;
                    if (historyAverage > 0 && amount > historyAverage * spikeMultiplier) {
                        const formattedSubcategory = subcategory.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                        patterns.push({
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
                        patterns.push({
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
                    return patterns.filter(p => dismissedIds.includes(p.id));
                }
                return patterns.filter(p => !dismissedIds.includes(p.id));
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
}

export const insightService = new InsightService();
