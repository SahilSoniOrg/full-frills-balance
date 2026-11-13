import { analytics } from '@/src/services/analytics';
import { useCallback, useSyncExternalStore } from 'react';

/** Boolean PostHog flag hook. Unavailable flags default to off. */
export function usePostHogFeatureFlag(flagKey: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => analytics.subscribeToFeatureFlags(onChange),
    [],
  );
  const getSnapshot = useCallback(() => analytics.isFeatureFlagEnabled(flagKey), [flagKey]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
