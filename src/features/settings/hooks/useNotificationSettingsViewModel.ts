import { useNotificationPrefs } from '@/src/hooks/useNotificationPrefs';
import { analytics } from '@/src/services/analytics';
import {
  notificationService,
  NotificationCadence,
} from '@/src/services/notification/NotificationService';
import { useCallback, useRef } from 'react';

export interface NotificationSettingsViewModel {
  notificationCadence: NotificationCadence;
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number;
  onUpdateNotificationCadence: (cadence: NotificationCadence) => Promise<void>;
  onUpdateNotificationTime: (hour: number, minute: number, weekday?: number) => Promise<void>;
  onSendTestNotification: () => void;
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

  return {
    notificationCadence,
    notificationHour,
    notificationMinute,
    notificationWeekday,
    onUpdateNotificationCadence,
    onUpdateNotificationTime,
    onSendTestNotification: () => notificationService.sendImmediateTest(),
  };
}
