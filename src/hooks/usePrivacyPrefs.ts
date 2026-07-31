import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type PrivacyPrefsState = {
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  isAppLockEnabled: boolean;
  setPrivacyMode: (enabled: boolean) => void;
  setWidgetPrivacyEnabled: (enabled: boolean) => void;
  setAppLockEnabled: (enabled: boolean) => void;
};

/**
 * Scoped privacy / lock prefs — expandable without growing UIContext.
 */
export function usePrivacyPrefs(): PrivacyPrefsState {
  const isPrivacyMode = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.privacy.observePrivacyMode().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.privacy.isPrivacyMode,
    () => preferences.privacy.isPrivacyMode,
  );

  const isWidgetPrivacyEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.privacy.observeWidgetPrivacyEnabled().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.privacy.isWidgetPrivacyEnabled,
    () => preferences.privacy.isWidgetPrivacyEnabled,
  );

  const isAppLockEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.privacy.observeAppLockEnabled().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.privacy.isAppLockEnabled,
    () => preferences.privacy.isAppLockEnabled,
  );

  const setPrivacyMode = useCallback((enabled: boolean) => {
    preferences.privacy.setIsPrivacyMode(enabled);
  }, []);

  const setWidgetPrivacyEnabled = useCallback((enabled: boolean) => {
    preferences.privacy.setIsWidgetPrivacyEnabled(enabled);
  }, []);

  const setAppLockEnabled = useCallback((enabled: boolean) => {
    preferences.privacy.setAppLockEnabled(enabled);
  }, []);

  return {
    isPrivacyMode,
    isWidgetPrivacyEnabled,
    isAppLockEnabled,
    setPrivacyMode,
    setWidgetPrivacyEnabled,
    setAppLockEnabled,
  };
}
