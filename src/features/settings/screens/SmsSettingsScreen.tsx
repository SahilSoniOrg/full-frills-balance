import { AppConfig } from '@/src/constants';
import { SmsSettingsView } from '@/src/features/settings/components/SmsSettingsView';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { analytics } from '@/src/services/analytics';
import { automaticSmsImportService } from '@/src/services/sms/AutomaticSmsImportService';
import { notificationService } from '@/src/services/notification/NotificationService';
import { smsReviewNotificationService } from '@/src/services/sms/SmsReviewNotificationService';
import { alert, confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

export default function SmsSettingsScreen() {
  const smsAlerts = AppConfig.strings.settings.smsAlerts;
  const {
    isAutomaticSmsImportEnabled,
    isSmsAutoPostEnabled,
    areSmsReviewNotificationsEnabled,
    showSmsNotificationDetails,
    setShowSmsNotificationDetails,
    setSmsAutoPostEnabled,
    setSmsReviewNotificationsEnabled,
  } = useSmsPrefs();

  const generation = useRef(0);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  useEffect(() => {
    let mounted = true;
    const check = () => {
      void notificationService
        .canDeliverSmsReview()
        .then(available => {
          if (mounted) setNotificationsBlocked(!available);
        })
        .catch(() => {
          if (mounted) setNotificationsBlocked(true);
        });
    };
    check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [areSmsReviewNotificationsEnabled]);

  const setAutomaticSmsImportEnabled = useCallback(
    async (enabled: boolean) => {
      let result: 'enabled' | 'denied' | 'never_ask_again' | 'cancelled';
      try {
        result = await automaticSmsImportService.setEnabledFromSettings(enabled);
      } catch {
        alert.show({
          title: smsAlerts.updateImportErrorTitle,
          message: smsAlerts.updateImportErrorMessage,
          type: 'error',
        });
        return;
      }
      if (result === 'cancelled') return;
      if (result !== 'enabled') {
        const message =
          result === 'never_ask_again'
            ? smsAlerts.smsPermissionNeverAskMessage
            : smsAlerts.smsPermissionDeniedMessage;
        if (result === 'never_ask_again') {
          confirm.show({
            title: smsAlerts.smsPermissionRequiredTitle,
            message,
            confirmText: smsAlerts.openSettings,
            cancelText: smsAlerts.cancel,
            onConfirm: () => void Linking.openSettings(),
          });
        } else {
          alert.show({
            title: smsAlerts.smsPermissionRequiredTitle,
            message,
            type: 'warning',
          });
        }
        return;
      }
      analytics.logSmsImportSettingsChanged(enabled);
      analytics.trackFeatureUsage('settings', 'toggle_sms_import', { enabled });
    },
    [smsAlerts],
  );

  const setSmsReviewNotificationsEnabledHandler = useCallback(
    async (enabled: boolean) => {
      const version = ++generation.current;
      try {
        const allowed =
          !enabled ||
          ((await notificationService.requestPermissions()) &&
            (await notificationService.canDeliverSmsReview()));
        if (version !== generation.current) return;
        setSmsReviewNotificationsEnabled(enabled);
        setNotificationsBlocked(enabled && !allowed);
        if (!allowed) {
          confirm.show({
            title: smsAlerts.notificationsBlockedTitle,
            message: smsAlerts.notificationsBlockedMessage,
            confirmText: smsAlerts.openSettings,
            cancelText: smsAlerts.cancel,
            onConfirm: () => void Linking.openSettings(),
          });
        }
        await smsReviewNotificationService.refresh();
      } catch {
        alert.show({
          title: smsAlerts.updateAlertsErrorTitle,
          message: smsAlerts.updateAlertsErrorMessage,
          type: 'error',
        });
      }
    },
    [setSmsReviewNotificationsEnabled, smsAlerts],
  );

  return (
    <SmsSettingsView
      isAutomaticSmsImportEnabled={isAutomaticSmsImportEnabled}
      isSmsAutoPostEnabled={isSmsAutoPostEnabled}
      areSmsReviewNotificationsEnabled={areSmsReviewNotificationsEnabled}
      showSmsNotificationDetails={showSmsNotificationDetails}
      notificationsBlocked={notificationsBlocked}
      onToggleSmsNotificationDetails={setShowSmsNotificationDetails}
      onToggleSmsImport={setAutomaticSmsImportEnabled}
      onToggleSmsAutoPost={setSmsAutoPostEnabled}
      onToggleSmsReviewNotifications={setSmsReviewNotificationsEnabledHandler}
      onOpenInbox={AppNavigation.toTransactionInbox}
      onOpenSmsRules={AppNavigation.toSmsRules}
    />
  );
}
