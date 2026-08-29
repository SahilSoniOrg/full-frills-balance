import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type ProfilePrefsState = {
  userName: string;
  setUserName: (name: string) => void;
};

/**
 * Scoped profile prefs (display name) — expandable without growing UIContext.
 */
export function useProfilePrefs(): ProfilePrefsState {
  const userName = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('userName').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.userName || '',
    () => preferences.userName || '',
  );

  const setUserName = useCallback((name: string) => {
    preferences.setUserName(name);
  }, []);

  return {
    userName,
    setUserName,
  };
}
