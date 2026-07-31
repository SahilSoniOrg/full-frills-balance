import { AppConfig } from '@/src/constants/app-config';
import { preferences } from '@/src/utils/preferences';
import type { NotificationCadence } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type NotificationPrefsState = {
  notificationCadence: NotificationCadence;
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number;
  setNotificationCadence: (cadence: NotificationCadence) => void;
  setNotificationTime: (hour: number, minute: number) => void;
  setNotificationWeekday: (weekday: number) => void;
};

/**
 * Scoped notification schedule prefs — expandable without growing UIContext.
 */
export function useNotificationPrefs(): NotificationPrefsState {
  const notificationCadence = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.notifications.observeCadence().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.notifications.notificationCadence,
    () => preferences.notifications.notificationCadence,
  );

  const notificationHour = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.notifications.observeHour().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () =>
      preferences.notifications.notificationHour ?? AppConfig.defaults.notifications.defaultHour,
    () =>
      preferences.notifications.notificationHour ?? AppConfig.defaults.notifications.defaultHour,
  );

  const notificationMinute = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.notifications.observeMinute().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () =>
      preferences.notifications.notificationMinute ??
      AppConfig.defaults.notifications.defaultMinute,
    () =>
      preferences.notifications.notificationMinute ??
      AppConfig.defaults.notifications.defaultMinute,
  );

  const notificationWeekday = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.notifications.observeWeekday().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () =>
      preferences.notifications.notificationWeekday ??
      AppConfig.defaults.notifications.defaultWeekday,
    () =>
      preferences.notifications.notificationWeekday ??
      AppConfig.defaults.notifications.defaultWeekday,
  );

  const setNotificationCadence = useCallback((cadence: NotificationCadence) => {
    preferences.notifications.setNotificationCadence(cadence);
  }, []);

  const setNotificationTime = useCallback((hour: number, minute: number) => {
    preferences.notifications.setNotificationTime(hour, minute);
  }, []);

  const setNotificationWeekday = useCallback((weekday: number) => {
    preferences.notifications.setNotificationWeekday(weekday);
  }, []);

  return {
    notificationCadence,
    notificationHour,
    notificationMinute,
    notificationWeekday,
    setNotificationCadence,
    setNotificationTime,
    setNotificationWeekday,
  };
}
