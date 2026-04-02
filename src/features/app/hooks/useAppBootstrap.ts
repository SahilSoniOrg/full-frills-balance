import { analytics } from '@/src/services/analytics-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { integrityService } from '@/src/services/integrity-service';
import { notificationService } from '@/src/services/notification/NotificationService';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { smsService } from '@/src/services/sms-service';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { useUI } from '@/src/contexts/UIContext';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Bootstraps app-wide side effects that must not live in UI context.
 */
export function useAppBootstrap() {
  const { isAppCurrentlyLocked } = useUI();

  useEffect(() => {
    if (isAppCurrentlyLocked) return;

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

      // 6. Initialize Notifications
      try {
        const cadence = preferences.notificationCadence;
        const hour = preferences.notificationHour;
        const minute = preferences.notificationMinute;
        await notificationService.scheduleReminder(cadence, hour, minute);
      } catch (error) {
        if (isActive) {
          logger.warn('[Bootstrap] Notification scheduling failed', { error });
        }
      }

      // 7. Trigger SMS check on Android
      try {
        if (Platform.OS === 'android' && preferences.isSmsImportEnabled) {
          await smsService.processUnprocessedSms();
        }
      } catch (error) {
        if (isActive) {
          logger.warn('[Bootstrap] SMS check failed', { error });
        }
      }
    };

    bootstrap();

    return () => {
      isActive = false;
    };
  }, [isAppCurrentlyLocked]);
}
