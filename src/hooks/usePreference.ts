import { preferences } from '@/src/services/preferences';
import type { UIPreferences } from '@/src/services/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export function usePreference<K extends keyof UIPreferences>(key: K) {
  const value = useSyncExternalStore(
    onStoreChange => {
      const subscription = preferences.observe(key).subscribe(() => onStoreChange());
      return () => subscription.unsubscribe();
    },
    () => preferences.getSnapshot()[key],
    () => preferences.getSnapshot()[key],
  );

  const setValue = useCallback(
    (nextValue: UIPreferences[K]) => {
      preferences.update({ [key]: nextValue } as Partial<UIPreferences>);
    },
    [key],
  );

  return { value, setValue };
}
