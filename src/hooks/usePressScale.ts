import { Opacity } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useState } from 'react';

/** Tactile press scale — same token AppLock / chrome already use. */
export const PRESS_SCALE = Opacity.subtle;
export const PRESS_IN_DURATION_MS = 100;
export const PRESS_OUT_DURATION_MS = 150;

/**
 * Moti animate/transition props for chrome press feedback.
 * Prefer `PressScaleTouchable` at call sites; use this hook only when composing differently.
 */
export function usePressScale() {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);

  return {
    animate: { scale: reduceMotion || !pressed ? Opacity.solid : PRESS_SCALE },
    transition: {
      type: 'timing' as const,
      duration: pressed ? PRESS_IN_DURATION_MS : PRESS_OUT_DURATION_MS,
    },
    handlePressIn: () => {
      if (!reduceMotion) setPressed(true);
    },
    handlePressOut: () => {
      if (!reduceMotion) setPressed(false);
    },
  };
}
