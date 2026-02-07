import { analytics } from '@/src/services/analytics-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { integrityService } from '@/src/services/integrity-service';
import { logger } from '@/src/utils/logger';
import { useEffect } from 'react';

/**
 * Bootstraps app-wide side effects that must not live in UI context.
 */
export function useAppBootstrap() {
  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      // Initialize Analytics
      analytics.initialize();

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
    };

    bootstrap();

    return () => {
      isActive = false;
    };
  }, []);
}
