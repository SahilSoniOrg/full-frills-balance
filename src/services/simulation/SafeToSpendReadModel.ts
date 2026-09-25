import { createEmptySafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { observeSafeToSpendInputSnapshot } from '@/src/services/simulation/safeToSpendInputAcquisition';
import { projectSafeToSpendDashboardFromSnapshot } from '@/src/services/simulation/safeToSpendProjection';
import { persistSafeToSpendSnapshot } from '@/src/services/simulation/safeToSpendSnapshotWriter';
import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { Platform } from 'react-native';
import { firstValueFrom, from, Observable, of } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';

/** Widget / headline path — intentionally tiny. */
export type SafeToSpendHeadline = {
  currencyCode: string;
  safeToSpend: number;
  shortfall: number;
  trajectoryMinBalance: number;
  firstMajorInflowDay: number | null;
  hasUnvaluedEntries?: boolean;
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
    ...(result.hasUnvaluedEntries ? { hasUnvaluedEntries: true } : {}),
  };
}

export class SafeToSpendReadModel {
  clearCache(): void {
    reactiveCacheCoordinator.clearNamespace(REACTIVE_CACHE_NAMESPACES.safeToSpend);
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
    // Cap to one active workplace so abandoned workplace pipelines are not sticky.
    if (
      !reactiveCacheCoordinator.has(
        REACTIVE_CACHE_NAMESPACES.safeToSpend,
        workplaceId,
        workplaceId,
      ) &&
      reactiveCacheCoordinator.hasNamespace(REACTIVE_CACHE_NAMESPACES.safeToSpend)
    ) {
      this.clearCache();
    }

    return reactiveCacheCoordinator.getOrCreate({
      namespace: REACTIVE_CACHE_NAMESPACES.safeToSpend,
      key: workplaceId,
      workplaceId,
      createSource: () =>
        workplaceService
          .observeCurrency(workplaceId)
          .pipe(
            switchMap(currencyCode => this.buildSafeToSpendPipeline(workplaceId, currencyCode)),
          ),
    });
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
          tap(result => {
            persistSafeToSpendSnapshot(workplaceId, result);
          }),
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
