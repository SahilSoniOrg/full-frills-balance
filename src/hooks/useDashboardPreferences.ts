import { preferences } from '@/src/services/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type DashboardPreferencesState = {
  showSafeToSpendChart: boolean;
  setShowSafeToSpendChart: (show: boolean) => void;
};

/**
 * Scoped dashboard display prefs — expandable without growing UIContext.
 */
export function useDashboardPreferences(): DashboardPreferencesState {
  const showSafeToSpendChart = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('showSafeToSpendChart').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().showSafeToSpendChart,
    () => preferences.getSnapshot().showSafeToSpendChart,
  );

  const setShowSafeToSpendChart = useCallback((show: boolean) => {
    preferences.update({ showSafeToSpendChart: show });
  }, []);

  return {
    showSafeToSpendChart,
    setShowSafeToSpendChart,
  };
}
