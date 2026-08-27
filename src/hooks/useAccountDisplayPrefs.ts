import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type AccountDisplayPrefsState = {
  showAccountMonthlyStats: boolean;
  setShowAccountMonthlyStats: (show: boolean) => void;
  useCompactAccountPicker: boolean;
  setUseCompactAccountPicker: (useCompact: boolean) => void;
};

/**
 * Scoped account-list display prefs — expandable without growing UIContext.
 */
export function useAccountDisplayPrefs(): AccountDisplayPrefsState {
  const showAccountMonthlyStats = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('showAccountMonthlyStats').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.showAccountMonthlyStats,
    () => preferences.showAccountMonthlyStats,
  );

  const setShowAccountMonthlyStats = useCallback((show: boolean) => {
    preferences.setShowAccountMonthlyStats(show);
  }, []);

  const useCompactAccountPicker = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('useCompactAccountPicker').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.useCompactAccountPicker,
    () => preferences.useCompactAccountPicker,
  );

  const setUseCompactAccountPicker = useCallback((useCompact: boolean) => {
    preferences.setUseCompactAccountPicker(useCompact);
  }, []);

  return {
    showAccountMonthlyStats,
    setShowAccountMonthlyStats,
    useCompactAccountPicker,
    setUseCompactAccountPicker,
  };
}
