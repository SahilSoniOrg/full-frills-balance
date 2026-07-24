import { AppConfig } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { WorkplaceId } from '@/src/types/domain';
import { traceService } from '@/src/utils/TraceService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, timer } from 'rxjs';
import { shareReplay, switchMap, take } from 'rxjs/operators';
import { reactiveDataService } from '../ReactiveDataService';
import { calculateInsights } from './insightCalculator';
import { Insight } from './insightTypes';

export type { Insight };

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

  /**
   * Clears internal pattern observation caches. Used for unit test isolation.
   */
  clearCache(): void {
    this.insightCache.clear();
  }

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
          reactiveDataService.observeJournalMeta(workplaceId),
          reactiveDataService.observeAccounts(workplaceId),
          plannedPaymentRepository.observeActive(workplaceId),
          this.refreshTrigger,
          of(ninetyDaysAgo),
        ]);
      }),
      switchMap(async ([_, accounts, activePlannedPayments, __, ninetyDaysAgo]) => {
        const trace = traceService.startTrace('InsightService.observePatterns');
        const minCount = insightsConfig.minRecurringCount;

        // 1. Concurrent Fetch: Recurring candidates and Expense history
        trace.metric('fetch_data');
        const [recurringCandidates, expenseTransactions] = await Promise.all([
          transactionRawRepository.getRecurringPatternsRaw(ninetyDaysAgo as number, minCount),
          transactionRawRepository.getTransactionsMetadataRaw(
            workplaceId,
            (accounts as Account[])
              .filter((a: Account) => a.accountType === AccountType.EXPENSE)
              .map((a: Account) => a.id),
            ninetyDaysAgo as number,
            Date.now(),
          ),
        ]);

        // 2. Offload Calculation (Database already did most of the work)
        const finalPatterns = calculateInsights({
          recurringCandidates,
          expenseTransactions,
          accounts: accounts as Account[],
          activePlannedPayments,
          workplaceId,
        });

        trace.end();
        const dismissedIds = preferences.dismissedPatternIds;
        if (onlyDismissed) {
          return finalPatterns.filter((p: Insight) => dismissedIds.includes(p.id));
        }
        return finalPatterns.filter((p: Insight) => !dismissedIds.includes(p.id));
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
