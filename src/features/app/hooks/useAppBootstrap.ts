import { useUI } from '@/src/contexts/UIContext';
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
import { integrityService } from '@/src/services/integrity-service';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { notificationService } from '@/src/services/notification/NotificationService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { WorkplaceId } from '@/src/types/domain';
import { runAppBootstrapSideEffects } from '../bootstrap';

/**
 * Bootstraps app-wide side effects and data hydration.
 * Optimized for fast initial render and background readiness.
 */
export function useAppBootstrap(workplaceId: WorkplaceId, defaultCurrencyCode: string) {
  const { isAppReady, setDataHydrated } = useUI();
  const lastInitializedWorkplaceRef = useRef<string | null>(null);

  // Register audit revert handlers once on cold start (idempotent).
  runAppBootstrapSideEffects();

  useEffect(() => {
    // Prevent double-running for the same workspace ID
    if (lastInitializedWorkplaceRef.current === workplaceId) return;
    lastInitializedWorkplaceRef.current = workplaceId;

    let timeoutId: NodeJS.Timeout;
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
      (async () => {
        try {
          // Stage A: Critical Data Seeding
          await currencyInitService.initialize();

          // Safe guard: check if workplace didn't change while we were waiting for the timeout or seed
          if (lastInitializedWorkplaceRef.current !== workplaceId) {
            logger.info(
              `[Bootstrap] Workplace changed during background initialization, aborting.`,
            );
            return;
          }

          // Stage B: Lean Cache Warming (Shared SQL Streams)
          await Promise.allSettled([
            currencyReadService.getAllPrecisions(),
            reactiveDataService.preWarm(defaultCurrencyCode, workplaceId),
            insightService.preWarm(workplaceId),
            safeToSpendReadModel.forWorkplace(workplaceId).preWarm(),
          ]);

          logger.info(
            `[Bootstrap] Core background hydration complete for workplace ${workplaceId} in ${Math.round(
              performance.now() - bgHydrationStart,
            )}ms (Total since boot: ${Math.round(performance.now() - bootStart)}ms)`,
          );
        } catch (error) {
          logger.error(
            `[Bootstrap] Background initialization failed partially for ${workplaceId}`,
            error,
          );
        }
      })();
    }, 50); // 50ms is enough for one clear UI frame and splash hide

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [workplaceId, defaultCurrencyCode, setDataHydrated]);

  // Background stabilization tasks - run once the app is ready and idle
  useEffect(() => {
    if (!isAppReady) return;

    let active = true;

    runAfterInteractions(async () => {
      // 3-second delay to ensure Dashboard animations and early interactions are smooth
      await new Promise(resolve => setTimeout(resolve, 3000));

      if (!active) {
        logger.info('[Bootstrap] Stabilization cancelled (workspace changed or unmounted)');
        return;
      }

      logger.info(`[Bootstrap] Running delayed background tasks for workplace ${workplaceId}...`);

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
        integrityService.runStartupCheck(workplaceId),
        plannedPaymentService.processDuePayments(workplaceId),
        sharingService.init(),
        exchangeRateService.preWarmCache(defaultCurrencyCode),
        notificationService.scheduleReminder(notifCadence, notifHour, notifMinute),
        ...(Platform.OS === 'android' && preferences.sms.isSmsImportEnabled && workplaceId
          ? [
              import('@/src/services/sms-service').then(({ smsService }) =>
                smsService.processUnprocessedSms(workplaceId),
              ),
            ]
          : []),
      ]);

      if (active) {
        logger.info(`[Bootstrap] Workplace ${workplaceId} fully stabilized.`);
      }
    });

    return () => {
      active = false;
    };
  }, [isAppReady, workplaceId, defaultCurrencyCode]);
}
