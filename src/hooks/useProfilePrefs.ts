import { DEFAULT_UI_PREFERENCES } from '@/src/services/preferences';
import { usePreference } from '@/src/hooks/usePreference';
import { useCallback } from 'react';

export type ProfilePrefsState = {
  userName: string;
  setUserName: (name: string) => void;
};

/**
 * Scoped profile prefs (display name) — expandable without growing UIContext.
 */
export function useProfilePrefs(): ProfilePrefsState {
  const { value: storedUserName, setValue: setStoredUserName } = usePreference('userName');
  const userName = storedUserName ?? DEFAULT_UI_PREFERENCES.userName;

  const setUserName = useCallback(
    (name: string) => {
      setStoredUserName(name);
    },
    [setStoredUserName],
  );

  return {
    userName,
    setUserName,
  };
}
