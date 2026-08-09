import { createEmptySafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { observeSafeToSpendInputSnapshot } from '@/src/services/simulation/safeToSpendInputAcquisition';
import { projectSafeToSpendDashboardFromSnapshot } from '@/src/services/simulation/safeToSpendProjection';
import { persistSafeToSpendSnapshot } from '@/src/services/simulation/safeToSpendSnapshotWriter';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Platform } from 'react-native';
import { firstValueFrom, from, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, take, tap } from 'rxjs/operators';
import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
export type {
  SafeToSpendDashboard,
  SafeToSpendDataPoint,
  SafeToSpendProjection,
} from '@/src/services/simulation/safeToSpendDashboardProjection';

/** Widget / headline path — intentionally tiny. */
export type SafeToSpendHeadline = {
  currencyCode: string;
  safeToSpend: number;
  shortfall: number;
  trajectoryMinBalance: number;
  firstMajorInflowDay: number | null;
};

export interface SafeToSpendHandle {
  /** Dashboard default — currency and window resolved inside the Module. */
  watch(): Observable<SafeToSpendDashboard>;
  /** Widget sync — same underlying projection, headline fields only. */
  watchHeadline(): Observable<SafeToSpendHeadline>;
  /** Splash pre-warm — fire-and-forget first emission. */
  preWarm(): Promise<void>;
}

function toHeadline(result: SafeToSpendDashboard): SafeToSpendHeadline {
  return {
    currencyCode: result.currencyCode,
    safeToSpend: result.summary.safeToSpend,
    shortfall: result.summary.shortfall,
    trajectoryMinBalance: result.summary.trajectoryMinBalance,
    firstMajorInflowDay: result.summary.firstMajorInflowDay ?? null,
  };
}

export class SafeToSpendReadModel {
  /** Single workplace-keyed cache — currency switchMaps inside the pipeline. */
  private workplaceWatchCache = new Map<WorkplaceId, Observable<SafeToSpendDashboard>>();

  clearCache(): void {
    this.workplaceWatchCache.clear();
  }

  /**
   * Bind Safe-to-Spend to a workplace. Currency and safeToSpendDays are
   * resolved inside the Implementation — callers do not pass them.
   */
  forWorkplace(workplaceId: WorkplaceId): SafeToSpendHandle {
    return {
      watch: () => this.watchWorkplace(workplaceId),
      watchHeadline: () => this.watchWorkplace(workplaceId).pipe(map(toHeadline)),
      preWarm: async () => {
        if (Platform.OS === 'web') return;
        try {
          await firstValueFrom(this.watchWorkplace(workplaceId).pipe(take(1)));
        } catch (error) {
          logger.warn('[SafeToSpendReadModel] Pre-warm failed', { error });
        }
      },
    };
  }

  private watchWorkplace(workplaceId: WorkplaceId): Observable<SafeToSpendDashboard> {
    const cached = this.workplaceWatchCache.get(workplaceId);
    if (cached) return cached;

    // Cap to one active workplace so abandoned workplace pipelines are not sticky.
    if (this.workplaceWatchCache.size > 0) {
      this.workplaceWatchCache.clear();
    }

    const obs = workplaceService.observeCurrency(workplaceId).pipe(
      switchMap(currencyCode => this.buildSafeToSpendPipeline(workplaceId, currencyCode)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.workplaceWatchCache.set(workplaceId, obs);
    return obs;
  }

  private buildSafeToSpendPipeline(
    workplaceId: WorkplaceId,
    defaultCurrencyCode: string,
  ): Observable<SafeToSpendDashboard> {
    return observeSafeToSpendInputSnapshot(workplaceId, defaultCurrencyCode).pipe(
      switchMap(outcome => {
        if (outcome.kind === 'empty') {
          return of(createEmptySafeToSpendDashboard(outcome.defaultCurrencyCode));
        }

        return from(projectSafeToSpendDashboardFromSnapshot(outcome.snapshot)).pipe(
          tap(result => persistSafeToSpendSnapshot(workplaceId, result)),
        );
      }),
      catchError(err => {
        logger.error(
          `[SafeToSpendReadModel] Error in simulation pipeline (Workplace: ${workplaceId}):`,
          err,
        );
        return of(createEmptySafeToSpendDashboard(defaultCurrencyCode));
      }),
    );
  }
}

export const safeToSpendReadModel = new SafeToSpendReadModel();
