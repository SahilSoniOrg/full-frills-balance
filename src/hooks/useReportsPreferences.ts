import { preferences } from '@/src/services/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export function useReportsPreferences() {
  const reportsV2Enabled = useSyncExternalStore(
    onStoreChange => {
      const subscription = preferences.observe('reportsV2Enabled').subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => preferences.getSnapshot().reportsV2Enabled,
    () => preferences.getSnapshot().reportsV2Enabled,
  );

  const setReportsV2Enabled = useCallback((enabled: boolean) => {
    preferences.update({ reportsV2Enabled: enabled });
  }, []);

  return { reportsV2Enabled, setReportsV2Enabled };
}
