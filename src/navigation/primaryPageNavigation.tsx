import type { PrimaryPageGroup } from '@/src/navigation/primaryPages';
import type { SharedValue } from 'react-native-reanimated';
import { createContext, useContext, useCallback, useEffect, useId } from 'react';
import { useIsFocused } from 'expo-router';

export type PrimaryPageNavigationValue = {
  activeRouteName: string;
  isTransitioning: boolean;
  scrollEnabled: boolean;
  pageProgress: SharedValue<number>;
  /** Swipe groups still mounted in the outer pager window (keep scroll/data warm). */
  keptAliveGroups: ReadonlySet<PrimaryPageGroup>;
  navigateToPage: (routeName: string) => void;
  setPageSwipeLock: (lockId: string, locked: boolean) => void;
};

const PrimaryPageNavigationContext = createContext<PrimaryPageNavigationValue | null>(null);

export const PrimaryPageNavigationProvider = PrimaryPageNavigationContext.Provider;

export function usePrimaryPageNavigation(): PrimaryPageNavigationValue | null {
  return useContext(PrimaryPageNavigationContext);
}

/**
 * True while this primary group is focused or still mounted in the pager window.
 * Use instead of bare useIsFocused for data/subscriptions so pages sliding away
 * do not empty or remount mid-pan.
 */
export function usePrimaryPageAlive(group: PrimaryPageGroup): boolean {
  const isFocused = useIsFocused();
  const pageNavigation = usePrimaryPageNavigation();
  return isFocused || (pageNavigation?.keptAliveGroups.has(group) ?? false);
}

/** Reserve paging while a child recognizer is deciding or handling a touch. */
export function usePrimaryPageSwipeReservation() {
  const navigation = usePrimaryPageNavigation();
  const setLock = navigation?.setPageSwipeLock;
  const id = useId();
  const reserve = useCallback(() => setLock?.(id, true), [setLock, id]);
  const release = useCallback(() => setLock?.(id, false), [setLock, id]);
  useEffect(() => release, [release]);
  return { reserve, release };
}
