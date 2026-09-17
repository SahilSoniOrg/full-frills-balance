import { useDeviceReduceMotionPreference } from '@/src/hooks/useDeviceMotionPrefs';
import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * True when motion should be simplified — system AccessibilityInfo OR the
 * device Appearance toggle. Animated chrome should disable or simplify when true.
 */
export function useReducedMotion(): boolean {
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const deviceReduceMotion = useDeviceReduceMotionPreference();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);

    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReduceMotion,
    );

    return () => listener.remove();
  }, []);

  return systemReduceMotion || deviceReduceMotion;
}
