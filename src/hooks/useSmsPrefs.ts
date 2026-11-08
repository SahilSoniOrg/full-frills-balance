import { preferences } from '@/src/services/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type SmsPrefsState = {
  isAutomaticSmsImportEnabled: boolean;
  areSmsReviewNotificationsEnabled: boolean;
  showSmsNotificationDetails: boolean;
  setShowSmsNotificationDetails: (enabled: boolean) => void;
  setSmsReviewNotificationsEnabled: (enabled: boolean) => void;
};

/**
 * Scoped SMS import prefs — expandable without growing UIContext.
 */
export function useSmsPrefs(): SmsPrefsState {
  const isAutomaticSmsImportEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.device
        .observe('isAutomaticSmsImportEnabled')
        .subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.device.getSnapshot().isAutomaticSmsImportEnabled,
    () => preferences.device.getSnapshot().isAutomaticSmsImportEnabled,
  );

  const areSmsReviewNotificationsEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.device
        .observe('areSmsReviewNotificationsEnabled')
        .subscribe(onStoreChange);
      return () => sub.unsubscribe();
    },
    () => preferences.device.getSnapshot().areSmsReviewNotificationsEnabled,
    () => preferences.device.getSnapshot().areSmsReviewNotificationsEnabled,
  );
  const setSmsReviewNotificationsEnabled = useCallback((enabled: boolean) => {
    preferences.device.update({ areSmsReviewNotificationsEnabled: enabled });
  }, []);

  const showSmsNotificationDetails = useSyncExternalStore(
    onChange => {
      const sub = preferences.device.observe('showSmsNotificationDetails').subscribe(onChange);
      return () => sub.unsubscribe();
    },
    () => preferences.device.getSnapshot().showSmsNotificationDetails,
    () => preferences.device.getSnapshot().showSmsNotificationDetails,
  );
  const setShowSmsNotificationDetails = useCallback((enabled: boolean) => {
    preferences.device.update({ showSmsNotificationDetails: enabled });
  }, []);

  return {
    showSmsNotificationDetails,
    setShowSmsNotificationDetails,
    isAutomaticSmsImportEnabled,
    areSmsReviewNotificationsEnabled,
    setSmsReviewNotificationsEnabled,
  };
}
