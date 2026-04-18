import { AppConfig } from '@/src/constants/app-config';
import { AppPhase, useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import * as Device from 'expo-device';
import { useEffect, useRef } from 'react';
import { InteractionManager, Platform } from 'react-native';

// Cache Warmup Imports
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { balanceService } from '@/src/services/BalanceService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { insightService } from '@/src/services/insight/InsightService';
import { notificationService } from '@/src/services/notification/NotificationService';
import { sharingService } from '@/src/services/SharingService';

/**
 * Bootstraps app-wide side effects that must not live in UI context.
 * Hardened to follow a 4-phase adaptive hydration pipeline.
 */
export function useAppBootstrap() {
  const { isAppCurrentlyLocked, appPhase, dispatchBootEvent } = useUI();

  // SAFETY: phaseRef prevents stale closure captures in watchdog and ghost blocks
  const phaseRef = useRef(appPhase);
  useEffect(() => {
    phaseRef.current = appPhase;
  }, [appPhase]);

  // Watchdog ref for deterministic cleanup
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isAppCurrentlyLocked) return;

    let isActive = true;

    const bootstrap = async () => {
      const bootStart = performance.now();

      // -----------------------------------------------------------------------
      // PHASE 1: BOOTING (In-flight critical hydration)
      // -----------------------------------------------------------------------
      if (appPhase === AppPhase.BOOTING) {
        // TIGHTENED: Force-hide splash if Phase 1 hangs too long
        if (watchdogRef.current) clearTimeout(watchdogRef.current);

        watchdogRef.current = setTimeout(() => {
          if (isActive && phaseRef.current === AppPhase.BOOTING) {
            logger.warn('[Bootstrap] Watchdog triggered: Force-hiding splash after stall.');
            dispatchBootEvent('PREFS_HYDRATED'); // Emergency bypass
          }
        }, AppConfig.timing.bootWatchdogMs);

        try {
          // RUTHLESS: Stage 1 ONLY blocks on reading configuration
          const prefs = await preferences.loadPreferences();

          analytics.initialize();

          if (watchdogRef.current) {
            clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
          }

          const readyTime = performance.now() - bootStart;
          logger.metric('Bootstrap.ready', readyTime);

          // Signal critical hydration is complete (Room 1 READY)
          dispatchBootEvent('PREFS_HYDRATED');

          // -------------------------------------------------------------------
          // GHOST HYDRATION: Non-blocking, Sequential, Adaptive
          // -------------------------------------------------------------------
          const ghostPass = async (initialPrefs: typeof prefs) => {
            // Early exit if app moved to stable or unmounted
            if (!isActive || phaseRef.current !== AppPhase.BOOTING) return;

            // HYBRID LUNGS: Yield to UI interactions but GUARANTEE progress via fallback
            const yieldToUI = () =>
              new Promise(resolve => {
                let resolved = false;
                InteractionManager.runAfterInteractions(() => {
                  if (!resolved) {
                    resolved = true;
                    resolve(null);
                  }
                });
                // Fallback: don't let background work starve indefinitely if thread is slammed
                setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    resolve(null);
                  }
                }, 100);
              });

            try {
              // Step 0: Background Identifications
              let anonId = initialPrefs.anonymizedId;
              if (!anonId) {
                anonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                await preferences.setAnonymizedId(anonId);
              }
              analytics.identify(anonId);

              // Step 1: Seed common data if missing
              if (!isActive || phaseRef.current >= AppPhase.STABILIZED) return;
              await yieldToUI();
              await currencyInitService.initialize();

              // Step 2: High-traffic metadata caches
              if (!isActive || phaseRef.current >= AppPhase.STABILIZED) return;
              await yieldToUI();
              await Promise.allSettled([
                exchangeRateService.preWarmCache(),
                currencyRepository.getAllPrecisions(),
                accountRepository.findAll(),
              ]);

              // Step 3: Heavy computational services (Adaptive Gating)
              // Skip simulation pre-warm on lower-end Android to protect thermal/memory overhead
              const totalMemory = Device.totalMemory ?? 0;
              const isLowEnd = Platform.OS === 'android' && totalMemory < 3 * 1024 * 1024 * 1024;

              if (!isActive || phaseRef.current >= AppPhase.STABILIZED || isLowEnd) return;
              await yieldToUI();
              balanceService.getAccountBalances().catch(() => {});
              notificationService.preWarm();
              insightService.preWarm();

              logger.info('[Bootstrap] Ghost hydration pass complete.');
            } catch (err) {
              logger.warn('[Bootstrap] Ghost hydration failed partially', { error: err });
            }
          };

          ghostPass(prefs);
        } catch (error) {
          if (watchdogRef.current) {
            clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
          }
          logger.error('[Bootstrap] Critical initialization failed', error);
          dispatchBootEvent('PREFS_HYDRATED');
        }
        return;
      }

      // -----------------------------------------------------------------------
      // PHASE 3: STABILIZATION (Heavy maintenance tasks)
      // -----------------------------------------------------------------------
      if (appPhase !== AppPhase.READY) return;

      // InteractionManager ensures we don't jank splash-to-tabs transition
      InteractionManager.runAfterInteractions(async () => {
        if (!isActive) return;

        logger.info('[Bootstrap] Stabilizing background services...');

        // Run non-critical background checks with INLINE REQUIRES
        try {
          const { integrityService } = require('@/src/services/integrity-service');
          await integrityService.runStartupCheck();
        } catch (error) {
          if (isActive) logger.warn('[Bootstrap] Integrity check failed', { error });
        }

        try {
          const { plannedPaymentService } = require('@/src/services/PlannedPaymentService');
          await plannedPaymentService.processDuePayments();
        } catch (error) {
          if (isActive) logger.error('[Bootstrap] Planned payments processing failed', error);
        }

        try {
          await sharingService.init();
        } catch (error) {
          if (isActive) logger.warn('[Bootstrap] Sharing service initialization failed', { error });
        }

        try {
          const {
            notificationService,
          } = require('@/src/services/notification/NotificationService');
          const cadence = preferences.notificationCadence;
          const hour = preferences.notificationHour;
          const minute = preferences.notificationMinute;
          await notificationService.scheduleReminder(cadence, hour, minute);
        } catch (error) {
          if (isActive) logger.warn('[Bootstrap] Notification scheduling failed', { error });
        }

        try {
          if (Platform.OS === 'android' && preferences.isSmsImportEnabled) {
            const { smsService } = require('@/src/services/sms-service');
            await smsService.processUnprocessedSms();
          }
        } catch (error) {
          if (isActive) logger.warn('[Bootstrap] SMS check failed', { error });
        }

        if (isActive) {
          logger.info('[Bootstrap] App stabilized.');
          dispatchBootEvent('STABILIZATION_DONE');
        }
      });
    };

    bootstrap();

    return () => {
      isActive = false;
    };
  }, [isAppCurrentlyLocked, appPhase, dispatchBootEvent]);
}
