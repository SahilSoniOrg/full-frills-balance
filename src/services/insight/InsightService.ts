import { AppConfig } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { traceService } from '@/src/utils/TraceService';
import { logger } from '@/src/utils/logger';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { preferences } from '@/src/utils/preferences';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, timer } from 'rxjs';
import { shareReplay, switchMap, take } from 'rxjs/operators';

export interface Insight {
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
   * Pre-warms pattern matching observation in the background.
   * Triggers heavy SQL queries and pattern analysis during the splash screen
   * phase without blocking the first render.
   */
  async preWarm(workplaceId: WorkplaceId): Promise<void> {
    try {
      // Trigger the pattern matching chain and wait for the first emission.
      // This ensures repository caches are primed and initial analysis is done.
      await firstValueFrom(this.observePatterns(workplaceId).pipe(take(1)));
    } catch (error) {
      logger.warn('[InsightService] Pre-warm failed', { error });
    }
  }

  private insightCache = new Map<string, Observable<Insight[]>>();

  observeDismissedPatterns(workplaceId: WorkplaceId): Observable<Insight[]> {
    return this.observePatternsInternal(workplaceId, true);
  }

  observePatterns(workplaceId: WorkplaceId): Observable<Insight[]> {
    return this.observePatternsInternal(workplaceId, false);
  }

  private observePatternsInternal(
    workplaceId: WorkplaceId,
    onlyDismissed: boolean,
  ): Observable<Insight[]> {
    const cacheKey = `${workplaceId}_${onlyDismissed}`;
    const cached = this.insightCache.get(cacheKey);
    if (cached) return cached;

    const insightsConfig = AppConfig.insights;
    const lookbackDays = insightsConfig.lookbackDays;

    const oneHour = insightsConfig.refreshIntervalMs;

    const obs$: Observable<Insight[]> = timer(0, oneHour).pipe(
      switchMap(() => {
        const ninetyDaysAgo = Date.now() - lookbackDays * AppConfig.time.msPerDay;

        return combineLatest([
          transactionRepository.observeByDateRange(workplaceId, ninetyDaysAgo),
          accountRepository.observeAll(workplaceId),
          plannedPaymentRepository.observeActive(workplaceId),
          this.refreshTrigger,
          of(ninetyDaysAgo),
        ]);
      }),
      switchMap(async ([_, accounts, activePlannedPayments, __, ninetyDaysAgo]) => {
        const trace = traceService.startTrace('InsightService.observePatterns');
        const accountMap = new Map((accounts as Account[]).map((a: Account) => [a.id, a]));
        const minCount = insightsConfig.minRecurringCount;

        // 1. Concurrent Fetch: Recurring candidates and Expense history
        trace.metric('fetch_data');
        const [recurringCandidates, expenseTransactions] = await Promise.all([
          transactionRawRepository.getRecurringPatternsRaw(ninetyDaysAgo as number, minCount),
          transactionRepository.findByAccountsAndDateRange(
            workplaceId,
            (accounts as Account[])
              .filter((a: Account) => a.accountType === AccountType.EXPENSE)
              .map((a: Account) => a.id),
            ninetyDaysAgo as number,
            Date.now(),
          ),
        ]);

        const patterns: Insight[] = [];

        // 2. Batch fetch journals for recurring candidates to fix N+1
        trace.metric('evaluate_recurring');
        const candidateJournalIds = new Set<JournalId>();
        for (const candidate of recurringCandidates) {
          const acc = accountMap.get(candidate.accountId);
          if (acc?.accountType !== AccountType.EXPENSE) continue;
          const ids = (candidate.journalIds || '').split(',') as JournalId[];
          ids.forEach(id => id && candidateJournalIds.add(id as JournalId));
        }

        const [candidateJournals, allCandidateTransactions] = await Promise.all([
          journalRepository.findByIds(workplaceId, Array.from(candidateJournalIds)),
          transactionRepository.findByJournals(workplaceId, Array.from(candidateJournalIds)),
        ]);
        const journalMap = new Map(candidateJournals.map(j => [j.id, j]));

        const transactionsByJournal = new Map<JournalId, Transaction[]>();
        for (const tx of allCandidateTransactions) {
          const list = transactionsByJournal.get(tx.journalId) || [];
          list.push(tx);
          transactionsByJournal.set(tx.journalId, list);
        }

        // Process recurring candidates
        for (const candidate of recurringCandidates) {
          const acc = accountMap.get(candidate.accountId);
          if (acc?.accountType !== AccountType.EXPENSE) continue;

          const journalIds = (candidate.journalIds || '').split(',') as JournalId[];
          const groupTransactions: Transaction[] = [];
          for (const id of journalIds) {
            const txs = transactionsByJournal.get(id);
            if (txs) groupTransactions.push(...txs);
          }

          // Group by description (cached journals)
          const byDescription = new Map<string, Transaction[]>();
          for (const tx of groupTransactions) {
            const journal = journalMap.get(tx.journalId);
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
                severity:
                  amount > insightsConfig.spendingSpikeSeverityThreshold ? 'high' : 'medium',
                message: AppConfig.strings.dashboard.hub.subscriptionAmnesia.message,
                description: AppConfig.strings.dashboard.hub.subscriptionAmnesia.description(
                  formattedAmount,
                  description,
                  accountName,
                ),
                suggestion: AppConfig.strings.dashboard.hub.subscriptionAmnesia.suggestion,
                journalIds: group.map(t => t.journalId),
                amount,
                currencyCode: candidate.currencyCode,
                accountSubtype: acc.accountSubtype,
                accountName,
              });
            }
          }
        }

        // 3. Evaluate Leaks and Lifestyle Drift
        trace.metric('evaluate_leaks');
        const spikeWindow = insightsConfig.spikeWindowDays;
        const last7Days = Date.now() - spikeWindow * AppConfig.time.msPerDay;

        const finalPatterns = patterns.filter((p: Insight) => {
          if (p.type !== 'subscription-amnesiac') return true;
          const account = accounts.find((a: Account) => a.name === p.accountName);
          if (!account) return true;

          const isAlreadyPlanned = activePlannedPayments.some(
            (pp: PlannedPayment) =>
              Math.abs(pp.amount) === Math.abs(p.amount || 0) &&
              (pp.fromAccountId === account.id || pp.toAccountId === account.id),
          );
          return !isAlreadyPlanned;
        });

        const currentWeekTransactions = expenseTransactions.filter(
          t => t.transactionDate >= last7Days,
        );
        const previousWeeksTransactions = expenseTransactions.filter(
          t => t.transactionDate < last7Days,
        );

        const currentWeekBySubtype = new Map<string, number>();
        currentWeekTransactions.forEach(t => {
          const acc = accountMap.get(t.accountId);
          const subcat = acc?.accountSubtype || 'UNKNOWN';
          currentWeekBySubtype.set(
            subcat,
            (currentWeekBySubtype.get(subcat) || 0) + Math.abs(t.amount),
          );
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
            t => accountMap.get(t.accountId)?.accountSubtype === subtype,
          );
          const oldestDate =
            historicalTxs.length > 0
              ? Math.min(...historicalTxs.map(t => t.transactionDate))
              : null;
          const weeksOfHistory = oldestDate ? Math.max(1, (last7Days - oldestDate) / WEEK_MS) : 0;

          if (weeksOfHistory < MIN_WEEKS) return;

          const historyAverage = historyTotal / weeksOfHistory;

          const spikeMultiplier = insightsConfig.spendingSpikeMultiplier;
          if (historyAverage > 0 && amount > historyAverage * spikeMultiplier) {
            const formattedSubtype = subtype
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/\b\w/g, l => l.toUpperCase());
            const percentIncrease = Math.round((spikeMultiplier - 1) * 100);
            finalPatterns.push({
              id: `leak_${workplaceId}_${subtype}`,
              type: 'slow-leak',
              severity: 'low',
              message: AppConfig.strings.dashboard.hub.spendingSpike.message,
              description: AppConfig.strings.dashboard.hub.spendingSpike.description(
                formattedSubtype,
                percentIncrease,
              ),
              suggestion: AppConfig.strings.dashboard.hub.spendingSpike.suggestion,
              journalIds: Array.from(
                new Set(
                  currentWeekTransactions
                    .filter(t => accountMap.get(t.accountId)?.accountSubtype === subtype)
                    .map(t => t.journalId),
                ),
              ),
            });
          }
        });

        const assets = accounts.filter(a => a.accountType === AccountType.ASSET);
        if (assets.length > 0) {
          const hasEmergencyFund = assets.some(a => a.accountSubtype === 'EMERGENCY_FUND');
          const hasSignificantAssets = assets.length >= 3;

          if (!hasEmergencyFund && hasSignificantAssets) {
            const { insight: strings } = AppConfig.strings.dashboard.hub.emergencyFund;
            finalPatterns.push({
              id: `no_emergency_fund_${workplaceId}`,
              type: 'lifestyle-drift',
              severity: 'medium',
              message: strings.message,
              description: strings.description,
              suggestion: strings.suggestion,
              journalIds: [],
            });
          }
        }

        trace.end();
        const dismissedIds = preferences.dismissedPatternIds;
        if (onlyDismissed) {
          return finalPatterns.filter(p => dismissedIds.includes(p.id));
        }
        return finalPatterns.filter(p => !dismissedIds.includes(p.id));
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.insightCache.set(cacheKey, obs$);
    return obs$;
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

export const insightService = new InsightService();
