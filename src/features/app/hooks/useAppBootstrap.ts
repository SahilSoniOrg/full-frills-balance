import { useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// Cache Warmup Imports
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { insightService } from '@/src/services/insight/InsightService';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { sharingService } from '@/src/services/SharingService';
import { integrityService } from '@/src/services/integrity-service';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { notificationService } from '@/src/services/notification/NotificationService';
import { WorkplaceId } from '@/src/types/domain';

/**
 * Bootstraps app-wide side effects and data hydration.
 * Optimized for fast initial render and background readiness.
 */
export function useAppBootstrap(workplaceId: WorkplaceId, defaultCurrencyCode: string) {
  const { isAppReady, setDataHydrated } = useUI();
  const initStartedRef = useRef(false);

  useEffect(() => {
    // We allow initialization to start even if locked so data is ready upon unlock
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const initializeApp = () => {
      const bootStart = performance.now();
      logger.info(`[Bootstrap] Starting initialization at ${Math.round(bootStart)}ms`);

      // 1. Unblock UI IMMEDIATELY
      // This hides the splash screen and mounts the Dashboard.
      // Dashboard hooks will hit the MMKV cache synchronously (<20ms).
      logger.info(
        `[Bootstrap] Triggering UI Hydration signal at ${Math.round(performance.now() - bootStart)}ms`,
      );
      setDataHydrated(true);

      // 2. Background Hydration (Completely Parallel)
      // We wrap this in a timeout/interaction block to ensure the splash hide
      // and initial frame paint happen before we saturate the bridge with DB work.
      setTimeout(() => {
        const bgHydrationStart = performance.now();
        logger.info(
          `[Bootstrap] Starting background hydration at ${Math.round(bgHydrationStart - bootStart)}ms`,
        );
        (async () => {
          try {
            // Stage A: Critical Data Seeding
            await currencyInitService.initialize();

            // Stage B: Lean Cache Warming (Shared SQL Streams)
            await Promise.allSettled([
              currencyRepository.getAllPrecisions(),
              reactiveDataService.preWarm(defaultCurrencyCode, workplaceId),
              insightService.preWarm(workplaceId),
              notificationService.preWarm(workplaceId, defaultCurrencyCode),
            ]);

            logger.info(
              `[Bootstrap] Core background hydration complete in ${Math.round(
                performance.now() - bgHydrationStart,
              )}ms (Total since boot: ${Math.round(performance.now() - bootStart)}ms)`,
            );
          } catch (error) {
            logger.error('[Bootstrap] Background initialization failed partially', error);
          }
        })();
      }, 50); // 50ms is enough for one clear UI frame and splash hide
    };

    initializeApp();
  }, [workplaceId, defaultCurrencyCode, setDataHydrated]);

  // Background stabilization tasks - run once the app is ready and idle
  useEffect(() => {
    if (!isAppReady) return;

    runAfterInteractions(async () => {
      // 3-second delay to ensure Dashboard animations and early interactions are smooth
      await new Promise(resolve => setTimeout(resolve, 3000));

      logger.info('[Bootstrap] Running delayed background tasks...');

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
      const notifCadence = preferences.notificationCadence;
      const notifHour = preferences.notificationHour;
      const notifMinute = preferences.notificationMinute;

      await Promise.allSettled([
        integrityService.runStartupCheck(workplaceId),
        plannedPaymentService.processDuePayments(workplaceId),
        sharingService.init(),
        exchangeRateService.preWarmCache(defaultCurrencyCode),
        notificationService.scheduleReminder(notifCadence, notifHour, notifMinute),
        ...(Platform.OS === 'android' && preferences.isSmsImportEnabled && workplaceId
          ? [
              import('@/src/services/sms-service').then(({ smsService }) =>
                smsService.processUnprocessedSms(workplaceId),
              ),
            ]
          : []),
      ]);

      logger.info('[Bootstrap] App fully stabilized.');
    });
  }, [isAppReady, workplaceId, defaultCurrencyCode]);
}
