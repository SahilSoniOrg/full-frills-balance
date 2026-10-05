import { usePreference } from '@/src/hooks/usePreference';

export function useDashboardPreferences() {
  const { value: showSafeToSpendChart, setValue: setShowSafeToSpendChart } =
    usePreference('showSafeToSpendChart');

  return {
    showSafeToSpendChart,
    setShowSafeToSpendChart,
  };
}
