import { analytics } from '@/src/services/analytics-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { integrityService } from '@/src/services/integrity-service';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { useEffect } from 'react';

/**
 * Bootstraps app-wide side effects that must not live in UI context.
 */
export function useAppBootstrap() {
  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      // 1. Load preferences first to get/set anonymizedId
      try {
        await preferences.loadPreferences();

        let anonId = preferences.anonymizedId;
        if (!anonId) {
          anonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await preferences.setAnonymizedId(anonId);
        }

        // 2. Initialize Analytics with ID
        analytics.initialize();
        analytics.identify(anonId);
      } catch (error) {
        logger.error('[Bootstrap] Preferences/Analytics init failed', error);
      }

      try {
        await currencyInitService.initialize();
      } catch (error) {
        if (isActive) {
          logger.warn('[Bootstrap] Currency init failed', { error });
        }
      }

      try {
        await integrityService.runStartupCheck();
      } catch (error) {
        if (isActive) {
          logger.warn('[Bootstrap] Integrity check failed', { error });
        }
      }

      try {
        await plannedPaymentService.processDuePayments();
      } catch (error) {
        if (isActive) {
          logger.error('[Bootstrap] Planned payments processing failed', error);
        }
      }
    };

    bootstrap();

    return () => {
      isActive = false;
    };
  }, []);
}
