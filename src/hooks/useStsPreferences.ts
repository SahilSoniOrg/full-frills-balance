import { AppConfig } from '@/src/constants/app-config';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type StsPreferencesState = {
  safeToSpendDays: number;
  setSafeToSpendDays: (days: number) => void;
};

/**
 * Scoped safe-to-spend horizon prefs — expandable without growing UIContext.
 */
export function useStsPreferences(): StsPreferencesState {
  const safeToSpendDays = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.sts.observeSafeToSpendDays().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.sts.safeToSpendDays || AppConfig.defaults.safeToSpendDays,
    () => preferences.sts.safeToSpendDays || AppConfig.defaults.safeToSpendDays,
  );

  const setSafeToSpendDays = useCallback((days: number) => {
    preferences.sts.setSafeToSpendDays(days);
  }, []);

  return {
    safeToSpendDays,
    setSafeToSpendDays,
  };
}
