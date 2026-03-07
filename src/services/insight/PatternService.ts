import { AppConfig } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { RecurringPattern } from '@/src/data/repositories/TransactionTypes';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { preferences } from '@/src/utils/preferences';
import { BehaviorSubject, combineLatest, Observable, of, timer } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';

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

export class PatternService {
    private refreshTrigger = new BehaviorSubject<void>(undefined);

    observeDismissedPatterns(): Observable<Pattern[]> {
        return this.observePatternsInternal(true);
    }

    observePatterns(): Observable<Pattern[]> {
        return this.observePatternsInternal(false);
    }

    private observePatternsInternal(onlyDismissed: boolean): Observable<Pattern[]> {
        const insightsConfig = AppConfig.insights;
        const lookbackDays = insightsConfig.lookbackDays;

        const oneHour = insightsConfig.refreshIntervalMs;

        return timer(0, oneHour).pipe(
            switchMap(() => {
                const ninetyDaysAgo = Date.now() - (lookbackDays * AppConfig.time.msPerDay);

                return combineLatest([
                    transactionRepository.observeByDateRange(ninetyDaysAgo),
                    accountRepository.observeAll(),
                    plannedPaymentRepository.observeActive(),
                    this.refreshTrigger,
                    of(ninetyDaysAgo)
                ]);
            }),
            debounceTime(insightsConfig.patternDebounceMs),
            switchMap(async ([_, accounts, activePlannedPayments, __, ninetyDaysAgo]) => {
                const accountMap = new Map((accounts as Account[]).map((a: Account) => [a.id, a]));
                const minCount = insightsConfig.minRecurringCount;

                const recurringCandidates: RecurringPattern[] = await transactionRawRepository.getRecurringPatternsRaw(
                    ninetyDaysAgo as number,
                    minCount
                );
                const patterns: Pattern[] = [];

                for (const candidate of recurringCandidates) {
                    const acc = accountMap.get(candidate.accountId);
                    if (acc?.accountType !== AccountType.EXPENSE) continue;

                    const journalIds = (candidate.journalIds || '').split(',');
                    const transactions = await transactionRepository.findByJournals(journalIds);

                    // Group by description to handle case where two different subscriptions have same amount
                    const byDescription = new Map<string, typeof transactions>();
                    for (const tx of transactions) {
                        const journal = await tx.journal.fetch();
                        const desc = journal?.description || 'Unknown';
                        if (!byDescription.has(desc)) byDescription.set(desc, []);
                        byDescription.get(desc)!.push(tx);
                    }

                    for (const [description, group] of byDescription.entries()) {
                        if (group.length < minCount) continue;

                        group.sort((a, b) => a.transactionDate - b.transactionDate);
                        const intervals = [];
                        for (let i = 1; i < group.length; i++) {
                            intervals.push(group[i].transactionDate - group[i - 1].transactionDate);
                        }

                        const isRecurring = intervals.every(interval => {
                            const days = interval / AppConfig.time.msPerDay;
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
                                id: `sub_${amount}_${candidate.accountId}_${description.replace(/\s+/g, '_')}`,
                                type: 'subscription-amnesiac',
                                severity: amount > insightsConfig.spendingSpikeSeverityThreshold ? 'high' : 'medium',
                                message: 'Subscription Amnesia',
                                description: `You have a recurring payment of ${formattedAmount} for "${description}" in "${accountName}".`,
                                suggestion: 'Review this regular expense to see if it still provides value.',
                                journalIds: group.map(t => t.journalId),
                                amount,
                                currencyCode: candidate.currencyCode,
                                accountSubtype: acc.accountSubtype,
                                accountName,
                            });
                        }
                    }
                }

                const spikeWindow = insightsConfig.spikeWindowDays;
                const last7Days = Date.now() - (spikeWindow * AppConfig.time.msPerDay);

                const expenseTransactions = await transactionRepository.findByAccountsAndDateRange(
                    (accounts as Account[]).filter((a: Account) => a.accountType === AccountType.EXPENSE).map((a: Account) => a.id),
                    ninetyDaysAgo as number,
                    Date.now()
                );

                const finalPatterns = patterns.filter((p: Pattern) => {
                    if (p.type !== 'subscription-amnesiac') return true;
                    const account = accounts.find((a: Account) => a.name === p.accountName);
                    if (!account) return true;

                    const isAlreadyPlanned = activePlannedPayments.some((pp: PlannedPayment) =>
                        Math.abs(pp.amount) === Math.abs(p.amount || 0) &&
                        (pp.fromAccountId === account.id || pp.toAccountId === account.id)
                    );
                    return !isAlreadyPlanned;
                });

                const currentWeekTransactions = expenseTransactions.filter(t => t.transactionDate >= last7Days);
                const previousWeeksTransactions = expenseTransactions.filter(t => t.transactionDate < last7Days);

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

                    const MIN_WEEKS = 4;
                    const WEEK_MS = 7 * AppConfig.time.msPerDay;
                    const historicalTxs = previousWeeksTransactions.filter(
                        t => accountMap.get(t.accountId)?.accountSubtype === subtype
                    );
                    const oldestDate = historicalTxs.length > 0
                        ? Math.min(...historicalTxs.map(t => t.transactionDate))
                        : null;
                    const weeksOfHistory = oldestDate
                        ? Math.max(1, (last7Days - oldestDate) / WEEK_MS)
                        : 0;

                    if (weeksOfHistory < MIN_WEEKS) return;

                    const historyAverage = historyTotal / weeksOfHistory;

                    const spikeMultiplier = insightsConfig.spendingSpikeMultiplier;
                    if (historyAverage > 0 && amount > historyAverage * spikeMultiplier) {
                        const formattedSubtype = subtype.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                        const percentIncrease = Math.round((spikeMultiplier - 1) * 100);
                        finalPatterns.push({
                            id: `leak_${subtype}`,
                            type: 'slow-leak',
                            severity: 'low',
                            message: 'Spending Spike',
                            description: `Spending on "${formattedSubtype}" is ${percentIncrease}% higher than your weekly average.`,
                            suggestion: 'Check your recent activity in this category for any unusual spends.',
                            journalIds: Array.from(new Set(currentWeekTransactions.filter(t => accountMap.get(t.accountId)?.accountSubtype === subtype).map(t => t.journalId)))
                        });
                    }
                });

                const assets = accounts.filter(a => a.accountType === AccountType.ASSET);
                if (assets.length > 0) {
                    const hasEmergencyFund = assets.some(a => a.accountSubtype === 'EMERGENCY_FUND');
                    const hasSignificantAssets = assets.length > 3;

                    if (!hasEmergencyFund && hasSignificantAssets) {
                        finalPatterns.push({
                            id: `no_emergency_fund`,
                            type: 'lifestyle-drift',
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

    async dismissPattern(id: string): Promise<void> {
        await preferences.dismissPattern(id);
        this.refreshTrigger.next(undefined);
    }

    async undismissPattern(id: string): Promise<void> {
        await preferences.undismissPattern(id);
        this.refreshTrigger.next(undefined);
    }
}

export const patternService = new PatternService();
