import type { PrimaryPageGroup } from '@/src/navigation/primaryPages';
import type { SharedValue } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';
import { createContext, useContext } from 'react';
import { useIsFocused } from 'expo-router';

export type PrimaryPageNavigationValue = {
  activeRouteName: string;
  isTransitioning: boolean;
  pageProgress: SharedValue<number>;
  /** Swipe groups still mounted in the outer pager window (keep scroll/data warm). */
  keptAliveGroups: ReadonlySet<PrimaryPageGroup>;
  navigateToPage: (routeName: string) => void;
  setPageSwipeLock: (lockId: string, locked: boolean) => void;
};

const PrimaryPageGestureContext = createContext<GestureType | null>(null);

const PrimaryPageNavigationContext = createContext<PrimaryPageNavigationValue | null>(null);

export const PrimaryPageNavigationProvider = PrimaryPageNavigationContext.Provider;
export const PrimaryPageGestureProvider = PrimaryPageGestureContext.Provider;

export function usePrimaryPageNavigation(): PrimaryPageNavigationValue | null {
  return useContext(PrimaryPageNavigationContext);
}

export function usePrimaryPageGesture(): GestureType | null {
  return useContext(PrimaryPageGestureContext);
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
