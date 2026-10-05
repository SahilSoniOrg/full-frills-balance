import { usePreference } from '@/src/hooks/usePreference';
import { useCallback } from 'react';

type AccountDisplayPrefsState = {
  showAccountMonthlyStats: boolean;
  setShowAccountMonthlyStats: (show: boolean) => void;
  useCompactAccountPicker: boolean;
  setUseCompactAccountPicker: (useCompact: boolean) => void;
};

export function useAccountDisplayPrefs(): AccountDisplayPrefsState {
  const { value: showAccountMonthlyStats, setValue: setStoredAccountMonthlyStats } =
    usePreference('showAccountMonthlyStats');

  const setShowAccountMonthlyStats = useCallback(
    (show: boolean) => {
      setStoredAccountMonthlyStats(show);
    },
    [setStoredAccountMonthlyStats],
  );

  const { value: useCompactAccountPicker, setValue: setStoredCompactAccountPicker } =
    usePreference('useCompactAccountPicker');

  const setUseCompactAccountPicker = useCallback(
    (useCompact: boolean) => {
      setStoredCompactAccountPicker(useCompact);
    },
    [setStoredCompactAccountPicker],
  );

  return {
    showAccountMonthlyStats,
    setShowAccountMonthlyStats,
    useCompactAccountPicker,
    setUseCompactAccountPicker,
  };
}
