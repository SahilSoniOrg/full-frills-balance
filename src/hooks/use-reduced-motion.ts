import { preferences } from '@/src/services/preferences';
import { AccessibilityInfo } from 'react-native';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * True when the user wants reduced motion — either via system accessibility
 * settings or the in-app Appearance toggle (device preference). Animated chrome
 * should disable or simplify motion when this is true.
 */
export function useReducedMotion(): boolean {
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);

    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReduceMotion,
    );

    return () => listener.remove();
  }, []);

  const deviceReduceMotion = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.device.observe('reduceMotion').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.device.reduceMotion,
    () => preferences.device.reduceMotion,
  );

  return systemReduceMotion || deviceReduceMotion;
}
