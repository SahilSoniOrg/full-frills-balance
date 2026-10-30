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
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
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

    // Kick FX sheets as soon as the workplace is known so first-paint STS/wealth
    // can recover via spotRateUpdates instead of waiting for the 3s delayed batch.
    const earlyFx = new AbortController();
    void (async () => {
      try {
        const accountCurrencyBases = await accountQueryRepository
          .findAll(workplaceId)
          .then(accounts => accounts.map(account => account.currencyCode));
        if (earlyFx.signal.aborted) return;
        await exchangeRateService.refreshSpotBasesInBackground([
          defaultCurrencyCode,
          ...accountCurrencyBases,
        ]);
      } catch (error) {
        logger.warn('[Bootstrap] Early FX refresh failed', { error });
      }
    })();

    return () => earlyFx.abort();
  }, [workplaceId, defaultCurrencyCode, setDataHydrated]);

  // Background stabilization tasks - run once the app is ready and idle
  useEffect(() => {
    if (!isAppReady) return;

    const controller = new AbortController();
    let stabilizationTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const cancelInitialIdle = runAfterInteractions(() => {
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
          const runTask = (name: string, task: () => unknown): Promise<void> => {
            if (controller.signal.aborted) return Promise.resolve();
            return new Promise(resolve => {
              let cancelIdle = () => {};
              const finish = () => {
                controller.signal.removeEventListener('abort', onAbort);
                resolve();
              };
              const onAbort = () => {
                cancelIdle();
                finish();
              };
              controller.signal.addEventListener('abort', onAbort, { once: true });
              cancelIdle = runAfterInteractions(() => {
                if (controller.signal.aborted) return finish();
                void Promise.resolve()
                  .then(() => {
                    if (!controller.signal.aborted) return task();
                  })
                  .catch(error => logger.warn(`[Bootstrap] ${name} failed`, { error }))
                  .finally(finish);
              });
            });
          };

          // Independent platform setup must not wait for filesystem cleanup,
          // forecast emissions or an exchange-rate network request.
          await Promise.allSettled([
            runTask('Legacy AI cleanup', () => purgeLocalAiCachesOnce()),
            runTask('Sharing setup', () => sharingService.init()),
            runTask('Reminder setup', () =>
              notificationService.scheduleReminder(
                notifCadence,
                notifHour,
                notifMinute,
                notifWeekday,
              ),
            ),
            runTask('SMS setup', () => automaticSmsImportService.synchronizeOnAppStart()),
            (async () => {
              // Serialize expensive maintenance and yield between tasks. Writes
              // precede optional cache warming to avoid immediately rebuilding it.
              await runTask('Currency initialization', () => currencyInitService.initialize());
              await runTask('Currency precision warmup', () =>
                currencyReadService.getAllPrecisions(),
              );
              await runTask('Due planned payments', () =>
                processDuePlannedPayments(workplaceId, controller.signal),
              );
              await runTask('Startup integrity check', () =>
                runStartupCheck(workplaceId, controller.signal),
              );
              await runTask('Workplace cleanup', () => cleanupGhostWorkplaces());
              await runTask('Legacy SMS cleanup', () => smsPrivacyService.cleanupLegacyContent());
              await runTask('Journal balance check', () =>
                checkJournalBalancesOnStartup(workplaceId, controller.signal),
              );

              // Only optional valuation caches depend on completed FX warmup.
              await runTask('FX cache warmup', async () => {
                const accounts = await accountQueryRepository.findAll(workplaceId);
                if (controller.signal.aborted) return;
                await exchangeRateService.preWarmCache(
                  defaultCurrencyCode,
                  accounts.map(account => account.currencyCode),
                );
              });
              await runTask('Account cache warmup', () =>
                reactiveDataService.preWarm(defaultCurrencyCode, workplaceId),
              );
              await runTask('Insights warmup', () => insightService.preWarm(workplaceId));
            })(),
          ]);

          if (!controller.signal.aborted) {
            logger.info(`[Bootstrap] Workplace ${workplaceId} fully stabilized.`);
          }
        })();
      }, 3000);
    });

    return () => {
      controller.abort();
      cancelInitialIdle();
      if (stabilizationTimeoutId) clearTimeout(stabilizationTimeoutId);
    };
  }, [isAppReady, workplaceId, defaultCurrencyCode]);
}
