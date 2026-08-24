import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { traceService } from '@/src/utils/TraceService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, timer } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import {
  observeWorkplaceAccounts,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { calculateInsights } from './insightCalculator';
import { Insight } from './insightTypes';
import { createDisposableReplay, DisposableReplay } from '@/src/services/reactive/disposableReplay';

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

  private insightCache = new Map<
    string,
    DisposableReplay<Insight[]> & { workplaceId: WorkplaceId }
  >();

  /**
   * Disposes internal pattern observations, optionally for one workplace.
   */
  clearCache(workplaceId?: WorkplaceId): void {
    for (const [key, entry] of this.insightCache) {
      if (workplaceId !== undefined && entry.workplaceId !== workplaceId) continue;
      entry.dispose();
      this.insightCache.delete(key);
    }
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
    if (cached) return cached.observable;

    const insightsConfig = AppConfig.insights;
    const lookbackDays = insightsConfig.lookbackDays;

    const oneHour = insightsConfig.refreshIntervalMs;

    const obs$: Observable<Insight[]> = timer(0, oneHour).pipe(
      switchMap(() => {
        const ninetyDaysAgo = Date.now() - lookbackDays * AppConfig.time.msPerDay;

        return combineLatest([
          observeWorkplaceJournalMeta(workplaceId),
          observeWorkplaceAccounts(workplaceId),
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
          transactionRawRepository.getRecurringPatternsRaw(
            workplaceId,
            ninetyDaysAgo as number,
            minCount,
          ),
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
        const dismissedIds = preferences.insights.dismissedPatternIds;
        if (onlyDismissed) {
          return finalPatterns.filter((p: Insight) => dismissedIds.includes(p.id));
        }
        return finalPatterns.filter((p: Insight) => !dismissedIds.includes(p.id));
      }),
    );

    const replay = createDisposableReplay(obs$);
    this.insightCache.set(cacheKey, { ...replay, workplaceId });
    return replay.observable;
  }

  async dismissPattern(id: string): Promise<void> {
    await preferences.insights.dismissPattern(id);
    this.refreshTrigger.next(undefined);
  }

  async undismissPattern(id: string): Promise<void> {
    await preferences.insights.undismissPattern(id);
    this.refreshTrigger.next(undefined);
  }
}

export const insightService = new InsightService();
