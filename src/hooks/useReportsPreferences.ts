import { usePreference } from '@/src/hooks/usePreference';
import { useCallback } from 'react';

export function useReportsPreferences() {
  const { value: reportsV2Enabled, setValue } = usePreference('reportsV2Enabled');

  const setReportsV2Enabled = useCallback(
    (enabled: boolean) => {
      setValue(enabled);
    },
    [setValue],
  );

  return { reportsV2Enabled, setReportsV2Enabled };
}
