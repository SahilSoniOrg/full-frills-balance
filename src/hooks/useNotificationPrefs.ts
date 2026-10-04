import type { NotificationCadence } from '@/src/services/notification/NotificationService';
import { DEFAULT_UI_PREFERENCES } from '@/src/services/preferences';
import { usePreference } from '@/src/hooks/usePreference';
import { useCallback } from 'react';

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
  const { value: storedCadence, setValue: setStoredCadence } = usePreference('notificationCadence');
  const { value: notificationHour, setValue: setNotificationHour } =
    usePreference('notificationHour');
  const { value: notificationMinute, setValue: setNotificationMinute } =
    usePreference('notificationMinute');
  const { value: notificationWeekday, setValue: setNotificationWeekdayValue } =
    usePreference('notificationWeekday');
  const notificationCadence = storedCadence ?? DEFAULT_UI_PREFERENCES.notificationCadence;

  const setNotificationCadence = useCallback(
    (cadence: NotificationCadence) => {
      setStoredCadence(cadence);
    },
    [setStoredCadence],
  );

  const setNotificationTime = useCallback(
    (hour: number, minute: number) => {
      setNotificationHour(hour);
      setNotificationMinute(minute);
    },
    [setNotificationHour, setNotificationMinute],
  );

  const setNotificationWeekday = useCallback(
    (weekday: number) => {
      setNotificationWeekdayValue(weekday);
    },
    [setNotificationWeekdayValue],
  );

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
