import { preferences } from '@/src/services/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type DeviceMotionPrefsState = {
  reduceMotion: boolean;
  setReduceMotion: (reduceMotion: boolean) => void;
};

/** Device-scoped motion preference for this install. */
export function useDeviceMotionPrefs(): DeviceMotionPrefsState {
  const reduceMotion = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.device.observe('reduceMotion').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.device.reduceMotion,
    () => preferences.device.reduceMotion,
  );

  const setReduceMotion = useCallback((next: boolean) => {
    preferences.device.setReduceMotion(next);
  }, []);

  return {
    reduceMotion,
    setReduceMotion,
  };
}
