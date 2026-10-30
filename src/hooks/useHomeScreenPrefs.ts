import { useCallback } from 'react';
import { usePreference } from './usePreference';

export function useHomeScreenPrefs() {
  const { value, setValue } = usePreference('homeScreenVersion');
  const homeV2Enabled = value !== 'v1';
  const setHomeV2Enabled = useCallback(
    (enabled: boolean) => setValue(enabled ? 'v2' : 'v1'),
    [setValue],
  );
  return { homeV2Enabled, setHomeV2Enabled };
}
