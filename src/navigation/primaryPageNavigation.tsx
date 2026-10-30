import { primaryPageFromRouteName, type PrimaryPageGroup } from '@/src/navigation/primaryPages';
import type { SharedValue } from 'react-native-reanimated';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useId,
  useMemo,
  type ReactNode,
} from 'react';
import { useIsFocused } from 'expo-router';

export type PrimaryPageNavigationValue = {
  activeRouteName: string;
  isTransitioning: boolean;
  scrollEnabled: boolean;
  pageProgress: SharedValue<number>;
  navigateToPage: (routeName: string) => void;
  setPageSwipeLock: (lockId: string, locked: boolean) => void;
};

const PrimaryPageNavigationContext = createContext<PrimaryPageNavigationValue | null>(null);
type ScreenNavigationValue = Pick<
  PrimaryPageNavigationValue,
  'activeRouteName' | 'navigateToPage' | 'setPageSwipeLock'
>;
const ScreenNavigationContext = createContext<ScreenNavigationValue | null>(null);
const LiveReadRouteContext = createContext<string | undefined>(undefined);
const PreparedRoutesContext = createContext<ReadonlySet<string> | undefined>(undefined);

export function PrimaryPageNavigationProvider({
  value,
  children,
  liveRouteName,
  preparedRoutes,
}: {
  value: PrimaryPageNavigationValue;
  children: ReactNode;
  /** V2 advances read ownership after the content pager settles. */
  liveRouteName?: string;
  /** V2 idle-prepared neighbors. An empty set suspends reads while the shell is inactive. */
  preparedRoutes?: ReadonlySet<string>;
}) {
  const { activeRouteName, navigateToPage, setPageSwipeLock } = value;
  const screenNavigation = useMemo(
    () => ({ activeRouteName, navigateToPage, setPageSwipeLock }),
    [activeRouteName, navigateToPage, setPageSwipeLock],
  );
  return (
    <PrimaryPageNavigationContext.Provider value={value}>
      <ScreenNavigationContext.Provider value={screenNavigation}>
        <LiveReadRouteContext.Provider value={liveRouteName}>
          <PreparedRoutesContext.Provider value={preparedRoutes}>
            {children}
          </PreparedRoutesContext.Provider>
        </LiveReadRouteContext.Provider>
      </ScreenNavigationContext.Provider>
    </PrimaryPageNavigationContext.Provider>
  );
}

/** Only pager mechanics subscribe to transition and gesture state. */
export function usePrimaryPagerNavigation(): PrimaryPageNavigationValue | null {
  return useContext(PrimaryPageNavigationContext);
}

export function usePrimaryPageNavigation(): ScreenNavigationValue | null {
  return useContext(ScreenNavigationContext);
}
/** Live reads belong to the selected group; retained pages keep their last paint. */
export function usePrimaryPageActive(group: PrimaryPageGroup): boolean {
  const isFocused = useIsFocused();
  const navigation = usePrimaryPageNavigation();
  const liveRoute = useContext(LiveReadRouteContext);
  const preparedRoutes = useContext(PreparedRoutesContext);
  if (preparedRoutes) {
    return [...preparedRoutes].some(route => primaryPageFromRouteName(route)?.group === group);
  }
  return (
    isFocused &&
    (!navigation ||
      primaryPageFromRouteName(liveRoute ?? navigation.activeRouteName)?.group === group)
  );
}

/** Exact-leaf read ownership for siblings sharing a group provider. */
export function usePrimaryLeafActive(routeName: string): boolean {
  const isFocused = useIsFocused();
  const navigation = usePrimaryPageNavigation();
  const liveRoute = useContext(LiveReadRouteContext);
  return isFocused && (!navigation || (liveRoute ?? navigation.activeRouteName) === routeName);
}

/** Allows a retained neighbor to prepare its first paint before the next swipe. */
export function usePrimaryLeafPrepared(routeName: string): boolean {
  const active = usePrimaryLeafActive(routeName);
  const preparedRoutes = useContext(PreparedRoutesContext);
  return preparedRoutes ? preparedRoutes.has(routeName) : active;
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
