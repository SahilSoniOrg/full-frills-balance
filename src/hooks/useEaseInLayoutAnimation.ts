import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useCallback } from 'react';
import { LayoutAnimation } from 'react-native';

/**
 * Prepares a one-shot ease-in/out LayoutAnimation, respecting Reduce Motion.
 * Call immediately before the state update that should animate.
 */
export function useEaseInLayoutAnimation() {
  const reduceMotion = useReducedMotion();
  return useCallback(() => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [reduceMotion]);
}
