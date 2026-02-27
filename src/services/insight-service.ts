import { AppConfig } from '@/src/constants';
import Account, { AccountSubcategory, AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
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
import dayjs from 'dayjs';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { debounceTime, map, switchMap } from 'rxjs/operators';

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
        ] as [Observable<Account[]>, Observable<Account[]>, Observable<Budget[]>, Observable<PlannedPayment[]>, Observable<Pattern[]>, Observable<Account[]>, Observable<Journal[]>]
        ).pipe(
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
        const insightsConfig = AppConfig.insights ?? DEFAULT_INSIGHTS_CONFIG;
        const lookbackDays = insightsConfig.lookbackDays;
        const ninetyDaysAgo = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);

        return combineLatest([
            transactionRepository.observeActive(),
            accountRepository.observeAll(),
            plannedPaymentRepository.observeActive(), // Added for deduplication
            this.refreshTrigger
        ]).pipe(
            debounceTime(500), // Performance optimization
            map(([transactions, accounts, activePlannedPayments]) => {
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
                    const minCount = insightsConfig.minRecurringCount;
                    if (group.length >= minCount) {
                        group.sort((a, b) => a.transactionDate - b.transactionDate);
                        const intervals = [];
                        for (let i = 1; i < group.length; i++) {
                            intervals.push(group[i].transactionDate - group[i - 1].transactionDate);
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
                            const amount = Math.abs(group[0].amount);
                            const account = accountMap.get(group[0].accountId);
                            const accountName = account?.name || 'Unknown Spending';
                            const formattedAmount = CurrencyFormatter.format(amount, group[0].currencyCode);

                            patterns.push({
                                id: `sub_${key}`,
                                type: 'subscription-amnesiac',
                                severity: amount > insightsConfig.spendingSpikeSeverityThreshold ? 'high' : 'medium',
                                message: 'Subscription Amnesia',
                                description: `You have a recurring payment of ${formattedAmount} in "${accountName}".`,
                                suggestion: 'Review this regular expense to see if it still provides value.',
                                journalIds: Array.from(new Set(group.map(t => t.journalId))),
                                amount,
                                currencyCode: group[0].currencyCode,
                                accountSubcategory: account?.accountSubcategory,
                                accountName,
                            });
                        }
                    }
                });

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
                const spikeWindow = insightsConfig.spikeWindowDays;
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
