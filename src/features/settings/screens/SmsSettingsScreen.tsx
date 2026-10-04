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

  const setAutomaticSmsImportEnabled = useCallback(async (enabled: boolean) => {
    let result: 'enabled' | 'denied' | 'never_ask_again' | 'cancelled';
    try {
      result = await automaticSmsImportService.setEnabledFromSettings(enabled);
    } catch {
      alert.show({
        title: 'Could not update SMS import',
        message: 'Try again after reopening the app.',
        type: 'error',
      });
      return;
    }
    if (result === 'cancelled') return;
    if (result !== 'enabled') {
      const message =
        result === 'never_ask_again'
          ? 'To enable automatic SMS import, allow SMS access in Android Settings. Messages are checked on this device while the feature is on.'
          : 'Automatic SMS import stays off until you allow SMS access. Messages are checked on this device while the feature is on.';
      if (result === 'never_ask_again') {
        confirm.show({
          title: 'SMS permission required',
          message,
          confirmText: 'Open Settings',
          cancelText: 'Cancel',
          onConfirm: () => void Linking.openSettings(),
        });
      } else {
        alert.show({ title: 'SMS permission required', message, type: 'warning' });
      }
      return;
    }
    analytics.logSmsImportSettingsChanged(enabled);
    analytics.trackFeatureUsage('settings', 'toggle_sms_import', { enabled });
  }, []);

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
            title: 'Notifications are blocked',
            message: 'Allow notifications and the SMS to review channel in system settings.',
            confirmText: 'Open Settings',
            cancelText: 'Cancel',
            onConfirm: () => void Linking.openSettings(),
          });
        }
        await smsReviewNotificationService.refresh();
      } catch {
        alert.show({
          title: 'Could not update SMS alerts',
          message: 'Try again after reopening the app.',
          type: 'error',
        });
      }
    },
    [setSmsReviewNotificationsEnabled],
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
