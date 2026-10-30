import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { PRIMARY_PAGES, primaryPageFromRouteName } from '@/src/navigation/primaryPages';

type PrimaryPageTransitionsOptions = {
  activeRouteName: string;
  routeNames: readonly string[];
  actions: { navigate: (routeName: string) => void };
  isSwitchingWorkplace: boolean;
  isFocused: boolean;
  isAppActive: boolean;
  isAppCurrentlyLocked: boolean;
};

/** Coordinates tap requests with pager transitions and settled read ownership. */
export function usePrimaryPageTransitions({
  activeRouteName,
  routeNames,
  actions,
  isSwitchingWorkplace,
  isFocused,
  isAppActive,
  isAppCurrentlyLocked,
}: PrimaryPageTransitionsOptions) {
  const [isTransitioning, setTransitioning] = useState(false);
  const [settledRouteDuringTransition, setSettledRouteDuringTransition] = useState(activeRouteName);
  const transitioningRef = useRef(false);
  const reportTransitioning = useCallback(
    (moving: boolean) => {
      if (moving && !transitioningRef.current) {
        setSettledRouteDuringTransition(activeRouteName);
      }
      transitioningRef.current = moving;
      setTransitioning(moving);
    },
    [activeRouteName],
  );
  const settledReadRoute = isTransitioning ? settledRouteDuringTransition : activeRouteName;
  const queuedRoute = useRef<string | null>(null);

  const navigateToPage = useCallback(
    (routeName: string) => {
      if (!primaryPageFromRouteName(routeName) || !routeNames.includes(routeName)) return;
      if (transitioningRef.current) {
        queuedRoute.current = routeName;
        return;
      }
      if (routeName === activeRouteName) return;
      // Native taps use the same transition coordinator as finger navigation.
      if (Platform.OS !== 'web') {
        reportTransitioning(true);
      }
      actions.navigate(routeName);
    },
    [actions, activeRouteName, routeNames, reportTransitioning],
  );

  useEffect(() => {
    if (isSwitchingWorkplace || !isFocused || !isAppActive || isAppCurrentlyLocked) {
      queuedRoute.current = null;
      return;
    }
    if (isTransitioning || !queuedRoute.current) return;
    const routeName = queuedRoute.current;
    queuedRoute.current = null;
    navigateToPage(routeName);
  }, [
    isTransitioning,
    navigateToPage,
    isSwitchingWorkplace,
    isFocused,
    isAppActive,
    isAppCurrentlyLocked,
  ]);

  const onUserPageSelected = useCallback(
    (index: number) => {
      const routeName = PRIMARY_PAGES[index]?.routeName;
      if (routeName && routeNames.includes(routeName)) actions.navigate(routeName);
    },
    [actions, routeNames],
  );

  return {
    isTransitioning,
    settledReadRoute,
    reportTransitioning,
    navigateToPage,
    onUserPageSelected,
  };
}
