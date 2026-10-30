import { useCallback } from 'react';
import { usePreference } from './usePreference';

// Preserve the existing build default until the user explicitly chooses a layout.
const DEFAULT_HOME_V2 =
  process.env.EXPO_PUBLIC_HOME_V2 === '1' || (__DEV__ && process.env.EXPO_PUBLIC_HOME_V2 !== '0');

export function useHomeScreenPrefs() {
  const { value, setValue } = usePreference('homeScreenVersion');
  const homeV2Enabled = value === 'v1' ? false : value === 'v2' ? true : DEFAULT_HOME_V2;
  const setHomeV2Enabled = useCallback(
    (enabled: boolean) => setValue(enabled ? 'v2' : 'v1'),
    [setValue],
  );
  return { homeV2Enabled, setHomeV2Enabled };
}
