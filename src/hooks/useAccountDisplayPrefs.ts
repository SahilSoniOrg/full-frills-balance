import { usePreference } from '@/src/hooks/usePreference';

export function useAccountDisplayPrefs() {
  const { value: showAccountMonthlyStats, setValue: setShowAccountMonthlyStats } =
    usePreference('showAccountMonthlyStats');

  const { value: useCompactAccountPicker, setValue: setUseCompactAccountPicker } =
    usePreference('useCompactAccountPicker');

  return {
    showAccountMonthlyStats,
    setShowAccountMonthlyStats,
    useCompactAccountPicker,
    setUseCompactAccountPicker,
  };
}
