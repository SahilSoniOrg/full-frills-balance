import { preferences } from '@/src/services/preferences';
import type { NotificationCadence } from '@/src/services/notification/NotificationService';
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
      const sub = preferences.observe('notificationCadence').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().notificationCadence || 'none',
    () => preferences.getSnapshot().notificationCadence || 'none',
  );

  const notificationHour = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('notificationHour').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().notificationHour,
    () => preferences.getSnapshot().notificationHour,
  );

  const notificationMinute = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('notificationMinute').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().notificationMinute,
    () => preferences.getSnapshot().notificationMinute,
  );

  const notificationWeekday = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('notificationWeekday').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().notificationWeekday,
    () => preferences.getSnapshot().notificationWeekday,
  );

  const setNotificationCadence = useCallback((cadence: NotificationCadence) => {
    preferences.update({ notificationCadence: cadence });
  }, []);

  const setNotificationTime = useCallback((hour: number, minute: number) => {
    preferences.update({ notificationHour: hour, notificationMinute: minute });
  }, []);

  const setNotificationWeekday = useCallback((weekday: number) => {
    preferences.update({ notificationWeekday: weekday });
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
