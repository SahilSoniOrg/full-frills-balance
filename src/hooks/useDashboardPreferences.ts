import { usePreference } from '@/src/hooks/usePreference';
import { useCallback } from 'react';

export type DashboardPreferencesState = {
  showSafeToSpendChart: boolean;
  setShowSafeToSpendChart: (show: boolean) => void;
};

/**
 * Scoped dashboard display prefs — expandable without growing UIContext.
 */
export function useDashboardPreferences(): DashboardPreferencesState {
  const { value: showSafeToSpendChart, setValue: setStoredSafeToSpendChart } =
    usePreference('showSafeToSpendChart');

  const setShowSafeToSpendChart = useCallback(
    (show: boolean) => {
      setStoredSafeToSpendChart(show);
    },
    [setStoredSafeToSpendChart],
  );

  return {
    showSafeToSpendChart,
    setShowSafeToSpendChart,
  };
}
