import { preferences } from '@/src/utils/preferences';
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
      const sub = preferences.dashboard.observeShowSafeToSpendChart().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.dashboard.showSafeToSpendChart,
    () => preferences.dashboard.showSafeToSpendChart,
  );

  const setShowSafeToSpendChart = useCallback((show: boolean) => {
    preferences.dashboard.setShowSafeToSpendChart(show);
  }, []);

  return {
    showSafeToSpendChart,
    setShowSafeToSpendChart,
  };
}
