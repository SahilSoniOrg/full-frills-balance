import { Scale } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useState } from 'react';

/** Tactile press scale — shared by PressScaleTouchable / AppLock. */
export const PRESS_SCALE = Scale.press;
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
    animate: { scale: reduceMotion || !pressed ? Scale.identity : PRESS_SCALE },
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
