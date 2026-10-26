import { useDeviceReduceMotionPreference } from '@/src/hooks/useDeviceMotionPrefs';
import { AccessibilityInfo } from 'react-native';
import { useSyncExternalStore } from 'react';

let systemReduceMotion = false;
let generation = 0;
let nativeSubscription: ReturnType<typeof AccessibilityInfo.addEventListener> | undefined;
const listeners = new Set<() => void>();

function publishSystemReduceMotion(next: boolean): void {
  if (systemReduceMotion === next) return;
  systemReduceMotion = next;
  listeners.forEach(listener => listener());
}

function subscribeSystemReduceMotion(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    const requestGeneration = ++generation;
    nativeSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', next => {
      generation += 1;
      publishSystemReduceMotion(next);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(
      next => {
        // A newer accessibility event or a completed subscription lifetime wins.
        if (generation === requestGeneration) publishSystemReduceMotion(next);
      },
      () => undefined,
    );
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      generation += 1;
      nativeSubscription?.remove();
      nativeSubscription = undefined;
    }
  };
}

function getSystemReduceMotion(): boolean {
  return systemReduceMotion;
}

/**
 * True when motion should be simplified — system AccessibilityInfo OR the
 * device Appearance toggle. Animated chrome should disable or simplify when true.
 */
export function useReducedMotion(): boolean {
  const systemReduceMotion = useSyncExternalStore(
    subscribeSystemReduceMotion,
    getSystemReduceMotion,
    getSystemReduceMotion,
  );
  const deviceReduceMotion = useDeviceReduceMotionPreference();
  return systemReduceMotion || deviceReduceMotion;
}
