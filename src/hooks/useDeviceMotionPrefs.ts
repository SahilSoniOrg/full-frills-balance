import { preferences } from '@/src/services/preferences';
import { useCallback, useSyncExternalStore } from 'react';

function subscribeDeviceReduceMotion(onStoreChange: () => void): () => void {
  const sub = preferences.device.observe('reduceMotion').subscribe(() => {
    onStoreChange();
  });
  return () => sub.unsubscribe();
}

function getDeviceReduceMotion(): boolean {
  return preferences.device.reduceMotion;
}

/** Device-scoped reduce-motion flag for this install (settings toggle; not system OR). */
export function useDeviceReduceMotionPreference(): boolean {
  return useSyncExternalStore(
    subscribeDeviceReduceMotion,
    getDeviceReduceMotion,
    getDeviceReduceMotion,
  );
}

export function useSetDeviceReduceMotion(): (reduceMotion: boolean) => void {
  return useCallback((next: boolean) => {
    preferences.device.setReduceMotion(next);
  }, []);
}
