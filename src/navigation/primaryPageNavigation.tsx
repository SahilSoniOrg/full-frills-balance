import type { SharedValue } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';
import { createContext, useContext } from 'react';

export type PrimaryPageNavigationValue = {
  activeRouteName: string;
  isTransitioning: boolean;
  pageProgress: SharedValue<number>;
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
