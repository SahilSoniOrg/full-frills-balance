import { usePreference } from '@/src/hooks/usePreference';
import { useCallback } from 'react';

type DashboardPreferencesState = {
  showSafeToSpendChart: boolean;
  setShowSafeToSpendChart: (show: boolean) => void;
};

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
