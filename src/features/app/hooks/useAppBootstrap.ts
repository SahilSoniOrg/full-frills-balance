import { AppConfig } from '@/src/constants/app-config';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { analytics } from '@/src/services/analytics';
import * as Application from 'expo-application';
import { ensureAnonymizedId } from '@/src/services/analytics/anonymizedIdentity';
import { currencyInitService } from '@/src/services/currency-init-service';
import { currencyReadService } from '@/src/services/currency-read-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/services/preferences';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useEffect } from 'react';

// Cache Warmup Imports
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { insightService } from '@/src/services/insight/InsightService';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { sharingService } from '@/src/services/SharingService';
import { cleanupGhostWorkplaces, runStartupCheck } from '@/src/services/integrity';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { smsPrivacyService } from '@/src/services/sms/SmsPrivacyService';
import { notificationService } from '@/src/services/notification/NotificationService';
import { WorkplaceId } from '@/src/types/ids';
import { runAppBootstrapSideEffects } from '../bootstrap';
import { checkJournalBalancesOnStartup } from '../journalBalanceStartupCheck';
import { purgeLocalAiCachesOnce } from '../purgeLocalAiCaches';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { snapshotService } from '@/src/utils/SnapshotService';
import { automaticSmsImportService } from '@/src/services/sms/AutomaticSmsImportService';

/**
 * Bootstraps app-wide side effects and data hydration.
 * Optimized for fast initial render and background readiness.
 */
export function useAppBootstrap(workplaceId: WorkplaceId, defaultCurrencyCode: string) {
  const { isAppReady, setDataHydrated } = useAppReady();

  // Register audit revert handlers once on cold start (idempotent).
  runAppBootstrapSideEffects();

  useEffect(() => {
    if (workplaceId) {
      widgetProjectionService.resumeWorkplace(workplaceId);
      snapshotService.resumeSnapshotsForWorkplace(workplaceId);
      analytics.syncActiveWorkplace(workplaceId, defaultCurrencyCode);
    }

    logger.info(`[Bootstrap] Starting initialization for workplace ${workplaceId}`);

    // Unblock UI immediately so cached dashboard can paint. Currency seeding
    // and precision warmup share the delayed batch below — a 50ms timer is
    // Detox-tracked and contended with first-paint SQLite.
    setDataHydrated(true);
  }, [workplaceId, defaultCurrencyCode, setDataHydrated]);

  // Background stabilization tasks - run once the app is ready and idle
  useEffect(() => {
    if (!isAppReady) return;

    const controller = new AbortController();
    let stabilizationTimeoutId: ReturnType<typeof setTimeout> | undefined;

    runAfterInteractions(() => {
      if (controller.signal.aborted) {
        logger.info('[Bootstrap] Stabilization cancelled (workspace changed or unmounted)');
        return;
      }

      // Keep the delay cancellable so a workplace switch cannot leave a stale timer behind.
      stabilizationTimeoutId = setTimeout(() => {
        void (async () => {
          if (controller.signal.aborted) return;

          logger.info(
            `[Bootstrap] Running delayed background tasks for workplace ${workplaceId}...`,
          );

          // 3. Lazy Analytics & Identity
          analytics.delayedInitializePostHog();
          analytics.track('app_opened', {
            version: Application.nativeApplicationVersion || AppConfig.appVersion,
            app_version: Application.nativeApplicationVersion || AppConfig.appVersion,
            build: Application.nativeBuildVersion || '1',
            app_build: Application.nativeBuildVersion || '1',
          });

          const anonId = ensureAnonymizedId(preferences.device.anonymizedId);
          if (anonId !== preferences.device.anonymizedId) {
            preferences.device.setAnonymizedId(anonId);
          }
          analytics.identify(anonId);

          // 4. Stabilization
          const {
            notificationCadence,
            notificationHour: notifHour,
            notificationMinute: notifMinute,
            notificationWeekday: notifWeekday,
          } = preferences.getSnapshot();
          const notifCadence = notificationCadence || 'none';
          await Promise.allSettled([
            purgeLocalAiCachesOnce(),
            currencyInitService.initialize(),
            currencyReadService.getAllPrecisions(),
            reactiveDataService.preWarm(defaultCurrencyCode, workplaceId),
            insightService.preWarm(workplaceId),
            runStartupCheck(workplaceId, controller.signal),
            cleanupGhostWorkplaces(),
            processDuePlannedPayments(workplaceId, controller.signal),
            smsPrivacyService.cleanupLegacyContent(),
            sharingService.init(),
            exchangeRateService.preWarmCache(defaultCurrencyCode),
            notificationService.scheduleReminder(
              notifCadence,
              notifHour,
              notifMinute,
              notifWeekday,
            ),
            automaticSmsImportService
              .synchronizeOnAppStart()
              .catch(error =>
                logger.warn('[Bootstrap] Automatic SMS import setup failed', { error }),
              ),
          ]);

          // Runs after the batch so a full journal scan does not contend with startup work.
          if (!controller.signal.aborted) {
            await checkJournalBalancesOnStartup(workplaceId, controller.signal).catch(error =>
              logger.warn('[Bootstrap] Journal balance check failed', { error }),
            );
          }

          if (!controller.signal.aborted) {
            logger.info(`[Bootstrap] Workplace ${workplaceId} fully stabilized.`);
          }
        })();
      }, 3000);
    });

    return () => {
      controller.abort();
      if (stabilizationTimeoutId) clearTimeout(stabilizationTimeoutId);
    };
  }, [isAppReady, workplaceId, defaultCurrencyCode]);
}
