import { ShareFormat } from '@/src/types/sharing';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type SharePrefsState = {
  defaultShareFormat: ShareFormat;
  setDefaultShareFormat: (format: ShareFormat) => void;
};

/**
 * Scoped share-format prefs — expandable without growing UIContext.
 */
export function useSharePrefs(): SharePrefsState {
  const defaultShareFormat = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('defaultShareFormat').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.defaultShareFormat || ShareFormat.TEXT,
    () => preferences.defaultShareFormat || ShareFormat.TEXT,
  );

  const setDefaultShareFormat = useCallback((format: ShareFormat) => {
    preferences.setDefaultShareFormat(format);
  }, []);

  return {
    defaultShareFormat,
    setDefaultShareFormat,
  };
}
