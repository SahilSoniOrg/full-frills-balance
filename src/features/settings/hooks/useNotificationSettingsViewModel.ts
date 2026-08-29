import { useNotificationPrefs } from '@/src/hooks/useNotificationPrefs';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { analytics } from '@/src/services/analytics';
import {
  notificationService,
  NotificationCadence,
} from '@/src/services/notification/NotificationService';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useRef } from 'react';

export interface NotificationSettingsViewModel {
  notificationCadence: NotificationCadence;
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number;
  onUpdateNotificationCadence: (cadence: NotificationCadence) => Promise<void>;
  onUpdateNotificationTime: (hour: number, minute: number, weekday?: number) => Promise<void>;
  onSendTestNotification: () => void;
  isSmsImportEnabled: boolean;
  setIsSmsImportEnabled: (enabled: boolean) => void;
  onOpenInbox: () => void;
  onOpenSmsRules: () => void;
}

export function useNotificationSettingsViewModel(): NotificationSettingsViewModel {
  const {
    notificationCadence,
    notificationHour,
    notificationMinute,
    notificationWeekday,
    setNotificationCadence,
    setNotificationTime,
    setNotificationWeekday,
  } = useNotificationPrefs();
  const { isSmsImportEnabled, setIsSmsImportEnabled } = useSmsPrefs();
  const notificationUpdateGenerationRef = useRef(0);

  const onUpdateNotificationCadence = useCallback(
    async (cadence: NotificationCadence) => {
      const generation = ++notificationUpdateGenerationRef.current;
      if (cadence !== 'none') {
        const granted = await notificationService.requestPermissions();
        if (!granted || generation !== notificationUpdateGenerationRef.current) return;
      }
      setNotificationCadence(cadence);
      analytics.logNotificationPreferenceChanged(cadence, notificationHour);
      await notificationService.scheduleReminder(
        cadence,
        notificationHour,
        notificationMinute,
        notificationWeekday,
      );
      analytics.trackFeatureUsage('settings', 'change_notification_cadence', { cadence });
    },
    [setNotificationCadence, notificationHour, notificationMinute, notificationWeekday],
  );

  const onUpdateNotificationTime = useCallback(
    async (hour: number, minute: number, weekday?: number) => {
      ++notificationUpdateGenerationRef.current;
      setNotificationTime(hour, minute);
      if (weekday !== undefined) {
        setNotificationWeekday(weekday);
      }
      await notificationService.scheduleReminder(
        notificationCadence,
        hour,
        minute,
        weekday ?? notificationWeekday,
      );
      analytics.trackFeatureUsage('settings', 'change_notification_time', {
        hour,
        minute,
        weekday: weekday ?? notificationWeekday,
      });
    },
    [setNotificationTime, setNotificationWeekday, notificationCadence, notificationWeekday],
  );

  const handleSetIsSmsImportEnabled = useCallback(
    (enabled: boolean) => {
      setIsSmsImportEnabled(enabled);
      analytics.logSmsImportSettingsChanged(enabled);
      analytics.trackFeatureUsage('settings', 'toggle_sms_import', { enabled });
    },
    [setIsSmsImportEnabled],
  );

  return {
    notificationCadence,
    notificationHour,
    notificationMinute,
    notificationWeekday,
    onUpdateNotificationCadence,
    onUpdateNotificationTime,
    onSendTestNotification: () => notificationService.sendImmediateTest(),
    isSmsImportEnabled,
    setIsSmsImportEnabled: handleSetIsSmsImportEnabled,
    onOpenInbox: AppNavigation.toTransactionInbox,
    onOpenSmsRules: AppNavigation.toSmsRules,
  };
}
