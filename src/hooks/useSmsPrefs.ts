import { preferences } from '@/src/services/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type SmsPrefsState = {
  isSmsImportEnabled: boolean;
  setIsSmsImportEnabled: (enabled: boolean) => void;
};

/**
 * Scoped SMS import prefs — expandable without growing UIContext.
 */
export function useSmsPrefs(): SmsPrefsState {
  const isSmsImportEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.device.observe('isSmsImportEnabled').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.device.getSnapshot().isSmsImportEnabled,
    () => preferences.device.getSnapshot().isSmsImportEnabled,
  );

  const setIsSmsImportEnabled = useCallback((enabled: boolean) => {
    preferences.device.update({ isSmsImportEnabled: enabled });
  }, []);

  return {
    isSmsImportEnabled,
    setIsSmsImportEnabled,
  };
}
