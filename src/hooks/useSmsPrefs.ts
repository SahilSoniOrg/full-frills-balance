import { preferences } from '@/src/utils/preferences';
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
      const sub = preferences.sms.observeSmsImportEnabled().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.sms.isSmsImportEnabled,
    () => preferences.sms.isSmsImportEnabled,
  );

  const setIsSmsImportEnabled = useCallback((enabled: boolean) => {
    preferences.sms.setIsSmsImportEnabled(enabled);
  }, []);

  return {
    isSmsImportEnabled,
    setIsSmsImportEnabled,
  };
}
