import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type AdvancedModePrefsState = {
  advancedMode: boolean;
  setAdvancedMode: (enabled: boolean) => void;
};

/**
 * Scoped journal advanced-mode pref — expandable without growing UIContext.
 */
export function useAdvancedModePrefs(): AdvancedModePrefsState {
  const advancedMode = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('advancedMode').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.advancedMode,
    () => preferences.advancedMode,
  );

  const setAdvancedMode = useCallback((enabled: boolean) => {
    preferences.setAdvancedMode(enabled);
  }, []);

  return {
    advancedMode,
    setAdvancedMode,
  };
}
