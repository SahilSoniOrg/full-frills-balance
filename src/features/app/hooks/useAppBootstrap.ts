import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { analytics } from '@/src/services/analytics-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { currencyReadService } from '@/src/services/currency-read-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// Cache Warmup Imports
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { insightService } from '@/src/services/insight/InsightService';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { sharingService } from '@/src/services/SharingService';
import { integrityService } from '@/src/services/integrity';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { notificationService } from '@/src/services/notification/NotificationService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { WorkplaceId } from '@/src/types/domain';
import { runAppBootstrapSideEffects } from '../bootstrap';
import { LatestGenerationCoordinator } from './latestGeneration';

/**
 * Bootstraps app-wide side effects and data hydration.
 * Optimized for fast initial render and background readiness.
 */
export function useAppBootstrap(workplaceId: WorkplaceId, defaultCurrencyCode: string) {
  const { isAppReady, setDataHydrated } = useAppReady();
  const hydrationCoordinatorRef = useRef<LatestGenerationCoordinator | null>(null);
  const stabilizationCoordinatorRef = useRef<LatestGenerationCoordinator | null>(null);

  hydrationCoordinatorRef.current ??= new LatestGenerationCoordinator();
  stabilizationCoordinatorRef.current ??= new LatestGenerationCoordinator();

  // Register audit revert handlers once on cold start (idempotent).
  runAppBootstrapSideEffects();

  useEffect(() => {
    const lease = hydrationCoordinatorRef.current!.begin();

    if (workplaceId) {
      analytics.syncActiveWorkplace(workplaceId, defaultCurrencyCode);
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const bootStart = performance.now();
    logger.info(
      `[Bootstrap] Starting initialization for workplace ${workplaceId} at ${Math.round(bootStart)}ms`,
    );

    // 1. Unblock UI IMMEDIATELY
    // This hides the splash screen and mounts the Dashboard.
    // Dashboard hooks will hit the MMKV cache synchronously (<20ms).
    setDataHydrated(true);

    // 2. Background Hydration (Completely Parallel)
    // We wrap this in a timeout to ensure the splash hide
    // and initial frame paint happen before we saturate the bridge with DB work.
    timeoutId = setTimeout(() => {
      const bgHydrationStart = performance.now();
      logger.info(
        `[Bootstrap] Starting background hydration for workplace ${workplaceId} at ${Math.round(
          bgHydrationStart - bootStart,
        )}ms`,
      );
      void (async () => {
        try {
          // Stage A: Critical Data Seeding
          await currencyInitService.initialize();

          // Safe guard: check if workplace didn't change while we were waiting for the timeout or seed
          if (!lease.isCurrent()) {
            logger.info(
              `[Bootstrap] Workplace changed during background initialization, aborting.`,
            );
            return;
          }

          // Stage B: Lean Cache Warming (Shared SQL Streams)
          await Promise.allSettled([
            currencyReadService.getAllPrecisions(),
            reactiveDataService.preWarm(defaultCurrencyCode, workplaceId),
            safeToSpendReadModel.forWorkplace(workplaceId).preWarm(),
          ]);

          if (!lease.isCurrent()) return;

          logger.info(
            `[Bootstrap] Core background hydration complete for workplace ${workplaceId} in ${Math.round(
              performance.now() - bgHydrationStart,
            )}ms (Total since boot: ${Math.round(performance.now() - bootStart)}ms)`,
          );
        } catch (error) {
          if (!lease.isCurrent()) return;
          logger.error(
            `[Bootstrap] Background initialization failed partially for ${workplaceId}`,
            error,
          );
        }
      })();
    }, 50); // 50ms is enough for one clear UI frame and splash hide

    return () => {
      lease.cancel();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [workplaceId, defaultCurrencyCode, setDataHydrated]);

  // Background stabilization tasks - run once the app is ready and idle
  useEffect(() => {
    if (!isAppReady) return;

    const lease = stabilizationCoordinatorRef.current!.begin();
    let stabilizationTimeoutId: ReturnType<typeof setTimeout> | undefined;

    runAfterInteractions(() => {
      if (!lease.isCurrent()) {
        logger.info('[Bootstrap] Stabilization cancelled (workspace changed or unmounted)');
        return;
      }

      // Keep the delay cancellable so a workplace switch cannot leave a stale timer behind.
      stabilizationTimeoutId = setTimeout(() => {
        void (async () => {
          if (!lease.isCurrent()) return;

          logger.info(
            `[Bootstrap] Running delayed background tasks for workplace ${workplaceId}...`,
          );

          // 3. Lazy Analytics & Identity
          analytics.delayedInitializePostHog();
          analytics.logAppOpened();

          let anonId = preferences.anonymizedId;
          if (!anonId) {
            anonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            preferences.setAnonymizedId(anonId);
          }
          analytics.identify(anonId);

          // 4. Stabilization
          const notifCadence = preferences.notifications.notificationCadence;
          const notifHour = preferences.notifications.notificationHour;
          const notifMinute = preferences.notifications.notificationMinute;

          await Promise.allSettled([
            insightService.preWarm(workplaceId),
            integrityService.runStartupCheck(workplaceId, lease.signal),
            processDuePlannedPayments(workplaceId, lease.signal),
            sharingService.init(),
            exchangeRateService.preWarmCache(defaultCurrencyCode),
            notificationService.scheduleReminder(notifCadence, notifHour, notifMinute),
            ...(Platform.OS === 'android' && preferences.sms.isSmsImportEnabled && workplaceId
              ? [
                  import('@/src/services/sms-service').then(({ smsService }) =>
                    lease.isCurrent()
                      ? smsService
                          .processUnprocessedSms(workplaceId, lease.signal)
                          .then(() => undefined)
                      : Promise.resolve(),
                  ),
                ]
              : []),
          ]);

          if (lease.isCurrent()) {
            logger.info(`[Bootstrap] Workplace ${workplaceId} fully stabilized.`);
          }
        })();
      }, 3000);
    });

    return () => {
      lease.cancel();
      if (stabilizationTimeoutId) clearTimeout(stabilizationTimeoutId);
    };
  }, [isAppReady, workplaceId, defaultCurrencyCode]);
}
