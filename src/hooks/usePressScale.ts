import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useCallback, useState } from 'react';

/** Matches legacy AppButton press language. */
export const PRESS_SCALE = 0.98;
export const PRESS_IN_DURATION_MS = 100;
export const PRESS_OUT_DURATION_MS = 150;

/**
 * Shared press-scale feedback for chrome controls (AppButton, FAB, IconButton).
 * Returns Moti animate/transition props; no-ops when reduced motion is enabled.
 */
export function usePressScale() {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);

  const handlePressIn = useCallback(() => {
    if (reduceMotion) return;
    setPressed(true);
  }, [reduceMotion]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) return;
    setPressed(false);
  }, [reduceMotion]);

  const scale = reduceMotion || !pressed ? 1 : PRESS_SCALE;

  return {
    animate: { scale },
    transition: {
      type: 'timing' as const,
      duration: pressed ? PRESS_IN_DURATION_MS : PRESS_OUT_DURATION_MS,
    },
    handlePressIn,
    handlePressOut,
    reduceMotion,
  };
}
