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
import { observeForecastDateBasis } from '@/src/services/simulation/forecastDateBasis';

/** Widget / headline path — intentionally tiny. */
export type SafeToSpendHeadline = {
  quality: 'ready' | 'stale' | 'unavailable';
  workplaceId: WorkplaceId;
  asOf: number;
  generatedAt: number;
  horizonDays: number;
  projectionError?: string;
  currencyCode: string;
  safeToSpend: number;
  shortfall: number;
  trajectoryMinBalance: number;
  firstMajorInflowDay: number | null;
  hasUnvaluedEntries?: boolean;
};

export function isSafeToSpendHeadlineCurrent(
  headline: SafeToSpendHeadline | null | undefined,
): headline is SafeToSpendHeadline {
  return headline?.quality === 'ready';
}

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
    quality: result.quality ?? 'ready',
    workplaceId: result.workplaceId,
    asOf: result.asOf,
    generatedAt: result.generatedAt,
    horizonDays: result.horizonDays,
    ...(result.projectionError ? { projectionError: result.projectionError } : {}),
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
      createSource: () => this.observeWorkplaceProjection(workplaceId),
    });
  }

  private observeWorkplaceProjection(workplaceId: WorkplaceId): Observable<SafeToSpendDashboard> {
    let hasCurrency = false;
    return workplaceService.observeCurrency(workplaceId).pipe(
      switchMap(currencyCode => {
        const currencyChanged = hasCurrency;
        hasCurrency = true;
        return this.buildSafeToSpendPipeline(workplaceId, currencyCode, currencyChanged);
      }),
    );
  }

  private buildSafeToSpendPipeline(
    workplaceId: WorkplaceId,
    defaultCurrencyCode: string,
    invalidateImmediately = false,
  ): Observable<SafeToSpendDashboard> {
    let lastSuccessful: SafeToSpendDashboard | undefined;
    return observeSafeToSpendInputSnapshot(
      workplaceId,
      defaultCurrencyCode,
      invalidateImmediately ? observeForecastDateBasis() : undefined,
    ).pipe(
      switchMap(outcome => {
        if (outcome.kind === 'refreshing') {
          return of(
            lastSuccessful
              ? { ...lastSuccessful, quality: 'stale' as const, projectionError: undefined }
              : {
                  ...createEmptySafeToSpendDashboard(defaultCurrencyCode, {
                    workplaceId: outcome.workplaceId,
                    asOf: outcome.asOf,
                    horizonDays: outcome.horizonDays,
                    quality: 'unavailable',
                  }),
                  projectionError: 'Refreshing forecast',
                },
          );
        }
        if (outcome.kind === 'empty') {
          lastSuccessful = undefined;
          return of({
            ...createEmptySafeToSpendDashboard(outcome.defaultCurrencyCode, {
              workplaceId: outcome.workplaceId,
              asOf: outcome.asOf,
              horizonDays: outcome.horizonDays,
              quality: 'ready',
            }),
          });
        }
        if (outcome.kind === 'failed') {
          const previous = lastSuccessful;
          return of(
            previous
              ? { ...previous, quality: 'stale' as const, projectionError: 'Input refresh failed' }
              : {
                  ...createEmptySafeToSpendDashboard(defaultCurrencyCode, {
                    workplaceId,
                    asOf: Date.now(),
                    horizonDays: 0,
                    quality: 'unavailable',
                  }),
                  projectionError: 'Input unavailable',
                },
          );
        }

        return from(projectSafeToSpendDashboardFromSnapshot(outcome.snapshot)).pipe(
          tap(result => {
            const ready = { ...result, quality: 'ready' as const };
            lastSuccessful = ready;
            persistSafeToSpendSnapshot(workplaceId, ready);
          }),
          map(result => ({ ...result, quality: 'ready' as const })),
          catchError(err => {
            logger.error(
              `[SafeToSpendReadModel] Projection failed (Workplace: ${workplaceId}):`,
              err,
            );
            const previous = lastSuccessful;
            return of(
              previous
                ? {
                    ...previous,
                    quality: 'stale' as const,
                    projectionError: 'Projection refresh failed',
                  }
                : {
                    ...createEmptySafeToSpendDashboard(defaultCurrencyCode, {
                      workplaceId,
                      asOf: Date.now(),
                      horizonDays: 0,
                      quality: 'unavailable',
                    }),
                    projectionError: 'Projection failed',
                  },
            );
          }),
        );
      }),
      catchError(err => {
        logger.error(
          `[SafeToSpendReadModel] Error in simulation pipeline (Workplace: ${workplaceId}):`,
          err,
        );
        const previous = lastSuccessful;
        return of(
          previous
            ? { ...previous, quality: 'stale' as const, projectionError: 'Input refresh failed' }
            : {
                ...createEmptySafeToSpendDashboard(defaultCurrencyCode, {
                  workplaceId,
                  asOf: Date.now(),
                  horizonDays: 0,
                  quality: 'unavailable',
                }),
                projectionError: 'Input unavailable',
              },
        );
      }),
    );
  }
}

export const safeToSpendReadModel = new SafeToSpendReadModel();
