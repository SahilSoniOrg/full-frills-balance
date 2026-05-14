import { AppConfig } from '@/src/constants/app-config';
import { AppPhase, useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { runAfterInteractions } from '@/src/utils/scheduler';
import * as Device from 'expo-device';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Subscription, firstValueFrom } from 'rxjs';

// Cache Warmup Imports
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { insightService } from '@/src/services/insight/InsightService';
import { notificationService } from '@/src/services/notification/NotificationService';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { sharingService } from '@/src/services/SharingService';
import { WorkplaceId } from '@/src/types/domain';
import { take } from 'rxjs/operators';

/**
 * Bootstraps app-wide side effects that must not live in UI context.
 * Hardened to follow a 4-phase adaptive hydration pipeline.
 */
export function useAppBootstrap(workplaceId: WorkplaceId, defaultCurrencyCode: string) {
  const { isAppCurrentlyLocked, appPhase, dispatchBootEvent } = useUI();

  // SAFETY: phaseRef prevents stale closure captures in watchdog and ghost blocks
  const phaseRef = useRef(appPhase);
  useEffect(() => {
    phaseRef.current = appPhase;
  }, [appPhase]);

  // Watchdog ref for deterministic cleanup
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);

  // ---------------------------------------------------------------------------
  // SESSION TRACKING: Ensures background work survives phase transitions
  // ---------------------------------------------------------------------------
  const sessionRef = useRef({
    workplaceId: '' as WorkplaceId,
    ghostPassStarted: false,
    stabilizationStarted: false,
    isActive: true,
  });

  // ---------------------------------------------------------------------------
  // EFFECT 1: CRITICAL BOOT & GHOST HYDRATION
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAppCurrentlyLocked) return;

    // Reset session tracking if workplace changed
    if (sessionRef.current.workplaceId !== workplaceId) {
      sessionRef.current = {
        workplaceId,
        ghostPassStarted: true,
        stabilizationStarted: false,
        isActive: true,
      };
    } else {
      // If already started for this workplace, don't re-run Phase 1
      if (sessionRef.current.ghostPassStarted) return;
      sessionRef.current.ghostPassStarted = true;
    }

    const subscriptions: Subscription[] = [];
    const session = sessionRef.current;

    /**
     * Ghost Hydration: Non-blocking, Sequential, Adaptive.
     * Survives transitions from BOOTING to READY because it doesn't depend on appPhase.
     */
    const ghostPass = async (initialPrefs: any) => {
      if (!session.isActive || phaseRef.current >= AppPhase.STABILIZED) return;

      const ghostStart = performance.now();
      logger.info('[Bootstrap] Ghost hydration pass starting...');

      const yieldToUI = async (stepName: string) => {
        const yieldStart = performance.now();
        await new Promise(resolve => {
          let resolved = false;
          runAfterInteractions(() => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          });
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }, 100);
        });
        logger.metric(`Bootstrap.Ghost.Yield.${stepName}`, performance.now() - yieldStart);
      };

      try {
        // Step 0: Background Identifications
        const idStart = performance.now();
        let anonId = initialPrefs.anonymizedId;
        if (!anonId) {
          anonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await preferences.setAnonymizedId(anonId);
        }
        analytics.identify(anonId);
        logger.metric('Bootstrap.Ghost.Step0.Identify', performance.now() - idStart);

        // Step 1: Seed common data if missing
        if (!session.isActive || phaseRef.current >= AppPhase.STABILIZED) return;
        await yieldToUI('Step1');
        const s1Start = performance.now();
        await currencyInitService.initialize();
        logger.metric('Bootstrap.Ghost.Step1.Currency', performance.now() - s1Start);

        // Step 2: High-traffic metadata caches
        if (!session.isActive || phaseRef.current >= AppPhase.STABILIZED) return;
        await yieldToUI('Step2');
        const s2Start = performance.now();
        await Promise.allSettled([
          exchangeRateService.preWarmCache(defaultCurrencyCode),
          currencyRepository.getAllPrecisions(),
          accountRepository.findAll(workplaceId),
        ]);
        logger.metric('Bootstrap.Ghost.Step2.Metadata', performance.now() - s2Start);

        // Step 3: Heavy computational services (Adaptive Gating)
        const totalMemory = Device.totalMemory ?? 0;
        const isLowEnd = Platform.OS === 'android' && totalMemory < 3 * 1024 * 1024 * 1024;

        if (!session.isActive || phaseRef.current >= AppPhase.STABILIZED || isLowEnd) {
          logger.info(
            `[Bootstrap] Ghost hydration pass complete early (Adaptive Gating) in ${Math.round(performance.now() - ghostStart)}ms.`,
          );
          return;
        }

        await yieldToUI('Step3');
        const s3Start = performance.now();
        // Step 3: Hydrate reactive streams for Home and Accounts screens
        await reactiveDataService.preWarm(defaultCurrencyCode, workplaceId);
        logger.metric('Bootstrap.Ghost.Step3.Balances', performance.now() - s3Start);

        const totalTime = Math.round(performance.now() - ghostStart);
        logger.metric('Bootstrap.Ghost.Total', totalTime);
        logger.info(`[Bootstrap] Ghost hydration pass complete (${totalTime}ms).`);
      } catch (err) {
        logger.warn('[Bootstrap] Ghost hydration failed partially', { error: err });
      }
    };

    const criticalBootstrap = async () => {
      const bootStart = performance.now();

      // PROACTIVE WARMING: Start these BEFORE any awaits.
      // These are fire-and-forget background subscriptions that warm RxJS shareReplay buffers.
      subscriptions.push(
        reactiveDataService
          .observeOptimizedAccountList(defaultCurrencyCode, workplaceId)
          .subscribe(),
        reactiveDataService.observeMonthlyFlow(defaultCurrencyCode, workplaceId).subscribe(),
        reactiveDataService.observeDashboardData(defaultCurrencyCode, workplaceId).subscribe(),
        notificationService.observeSafeToSpend(workplaceId, defaultCurrencyCode).subscribe(),
      );

      logger.info('[Bootstrap] Proactive warming triggered.');

      // PHASE 1: Only run if we are actually in the booting phase
      if (phaseRef.current === AppPhase.BOOTING) {
        if (watchdogRef.current) clearTimeout(watchdogRef.current);

        watchdogRef.current = setTimeout(() => {
          if (session.isActive && phaseRef.current === AppPhase.BOOTING) {
            logger.warn('[Bootstrap] Watchdog triggered: Force-hiding splash.');
            dispatchBootEvent('PREFS_HYDRATED');
            dispatchBootEvent('DATA_HYDRATED');
          }
        }, AppConfig.timing.bootWatchdogMs);

        try {
          const prefs = await preferences.loadPreferences();
          analytics.logAppOpened();

          if (watchdogRef.current) {
            clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
          }

          logger.metric('Bootstrap.ready', performance.now() - bootStart);
          dispatchBootEvent('PREFS_HYDRATED');

          // PHASE 1.5: Critical Data Hydration
          // We wait for the first emission of Safe-to-Spend data to avoid dashboard flicker.
          // Since we removed the initial debounce in NotificationService, this is near-instant.
          try {
            await firstValueFrom(
              notificationService
                .observeSafeToSpend(workplaceId, defaultCurrencyCode)
                .pipe(take(1)),
            );
            dispatchBootEvent('DATA_HYDRATED');
          } catch (err) {
            logger.warn('[Bootstrap] Critical data hydration failed', err as Error);
            // Fallback: don't block the app forever if simulation fails
            dispatchBootEvent('DATA_HYDRATED');
          }

          // Start the ghost pass
          ghostPass(prefs);
        } catch (error) {
          logger.error('[Bootstrap] Critical initialization failed', error);
          dispatchBootEvent('PREFS_HYDRATED');
          dispatchBootEvent('DATA_HYDRATED');
        }
      } else {
        // If we are already READY but just reached this effect (e.g. unlock),
        // still trigger ghost pass if it hasn't run.
        const prefs = await preferences.loadPreferences();
        ghostPass(prefs);
      }
    };

    criticalBootstrap();

    return () => {
      session.isActive = false;
      subscriptions.forEach(s => s.unsubscribe());
    };
  }, [isAppCurrentlyLocked, workplaceId, defaultCurrencyCode, dispatchBootEvent]);

  // ---------------------------------------------------------------------------
  // EFFECT 2: STABILIZATION (Phase-reactive)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAppCurrentlyLocked || appPhase !== AppPhase.READY) return;

    const session = sessionRef.current;
    if (session.stabilizationStarted) return;
    session.stabilizationStarted = true;

    runAfterInteractions(async () => {
      if (!session.isActive) return;

      logger.info('[Bootstrap] Stabilizing background services...');

      const notifCadence = preferences.notificationCadence;
      const notifHour = preferences.notificationHour;
      const notifMinute = preferences.notificationMinute;

      const results = await Promise.allSettled([
        import('@/src/services/integrity-service').then(({ integrityService }) =>
          integrityService.runStartupCheck(workplaceId),
        ),
        import('@/src/services/PlannedPaymentService').then(({ plannedPaymentService }) =>
          plannedPaymentService.processDuePayments(workplaceId),
        ),
        sharingService.init(),
        (async () => {
          notificationService.preWarm(workplaceId, defaultCurrencyCode);
          return notificationService.scheduleReminder(notifCadence, notifHour, notifMinute);
        })(),
        insightService.preWarm(workplaceId),
        ...(Platform.OS === 'android' && preferences.isSmsImportEnabled && workplaceId
          ? [
              import('@/src/services/sms-service').then(({ smsService }) =>
                smsService.processUnprocessedSms(workplaceId),
              ),
            ]
          : []),
      ]);

      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const labels = [
            'integrity',
            'planned-payments',
            'sharing',
            'notifications',
            'insights',
            'sms',
          ];
          logger.warn(`[Bootstrap] Stabilization task failed: ${labels[i] ?? i}`, {
            error: result.reason,
          });
        }
      });

      if (session.isActive) {
        logger.info('[Bootstrap] App stabilized.');
        dispatchBootEvent('STABILIZATION_DONE');
      }
    });
  }, [isAppCurrentlyLocked, appPhase, workplaceId, defaultCurrencyCode, dispatchBootEvent]);
}
