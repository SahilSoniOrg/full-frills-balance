import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { analytics } from '@/src/services/analytics';
import { ensureAnonymizedId } from '@/src/services/analytics/anonymizedIdentity';
import { currencyInitService } from '@/src/services/currency-init-service';
import { currencyReadService } from '@/src/services/currency-read-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/services/preferences';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useEffect, useRef } from 'react';

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
import { LatestGenerationCoordinator } from '@/src/services/LatestGenerationCoordinator';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { snapshotService } from '@/src/utils/SnapshotService';

/**
 * Bootstraps app-wide side effects and data hydration.
 * Optimized for fast initial render and background readiness.
 */
export function useAppBootstrap(workplaceId: WorkplaceId, defaultCurrencyCode: string) {
  const { isAppReady, setDataHydrated } = useAppReady();
  const stabilizationCoordinatorRef = useRef<LatestGenerationCoordinator | null>(null);

  stabilizationCoordinatorRef.current ??= new LatestGenerationCoordinator();

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
            runStartupCheck(workplaceId, lease.signal),
            cleanupGhostWorkplaces(),
            processDuePlannedPayments(workplaceId, lease.signal),
            smsPrivacyService.cleanupLegacyContent(),
            sharingService.init(),
            exchangeRateService.preWarmCache(defaultCurrencyCode),
            notificationService.scheduleReminder(
              notifCadence,
              notifHour,
              notifMinute,
              notifWeekday,
            ),
          ]);

          // Runs after the batch so a full journal scan does not contend with startup work.
          if (lease.isCurrent()) {
            await checkJournalBalancesOnStartup(workplaceId, lease.signal).catch(error =>
              logger.warn('[Bootstrap] Journal balance check failed', { error }),
            );
          }

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
