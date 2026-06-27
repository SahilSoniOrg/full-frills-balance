import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * Returns true when the user has requested reduced motion via system accessibility settings.
 * Animated components should disable or simplify motion when this is true.
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);

    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => listener.remove();
  }, []);

  return reduceMotion;
}
