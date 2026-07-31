import { AppConfig } from '@/src/constants/app-config';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type ProfilePrefsState = {
  userName: string;
  archetype: string;
  setUserName: (name: string) => void;
  setArchetype: (archetype: string) => void;
  updateUserDetails: (name: string, archetype?: string) => void;
};

/**
 * Scoped profile prefs (name / archetype) — expandable without growing UIContext.
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

  const archetype = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('archetype').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.archetype || AppConfig.defaults.archetype,
    () => preferences.archetype || AppConfig.defaults.archetype,
  );

  const setUserName = useCallback((name: string) => {
    preferences.setUserName(name);
  }, []);

  const setArchetype = useCallback((nextArchetype: string) => {
    preferences.setArchetype(nextArchetype);
  }, []);

  const updateUserDetails = useCallback((name: string, nextArchetype?: string) => {
    if (name) preferences.setUserName(name);
    if (nextArchetype) preferences.setArchetype(nextArchetype);
  }, []);

  return {
    userName,
    archetype,
    setUserName,
    setArchetype,
    updateUserDetails,
  };
}
