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
  /** Swipe groups still mounted in the outer pager window (keep scroll/data warm). */
  keptAliveGroups: ReadonlySet<PrimaryPageGroup>;
  navigateToPage: (routeName: string) => void;
  setPageSwipeLock: (lockId: string, locked: boolean) => void;
};

const PrimaryPageNavigationContext = createContext<PrimaryPageNavigationValue | null>(null);
type ScreenNavigationValue = Pick<
  PrimaryPageNavigationValue,
  'activeRouteName' | 'navigateToPage' | 'setPageSwipeLock'
>;
const ScreenNavigationContext = createContext<ScreenNavigationValue | null>(null);
const RetainedGroupsContext = createContext<ReadonlySet<PrimaryPageGroup> | null>(null);

export function PrimaryPageNavigationProvider({
  value,
  children,
}: {
  value: PrimaryPageNavigationValue;
  children: ReactNode;
}) {
  const { activeRouteName, navigateToPage, setPageSwipeLock } = value;
  const screenNavigation = useMemo(
    () => ({ activeRouteName, navigateToPage, setPageSwipeLock }),
    [activeRouteName, navigateToPage, setPageSwipeLock],
  );
  return (
    <PrimaryPageNavigationContext.Provider value={value}>
      <RetainedGroupsContext.Provider value={value.keptAliveGroups}>
        <ScreenNavigationContext.Provider value={screenNavigation}>
          {children}
        </ScreenNavigationContext.Provider>
      </RetainedGroupsContext.Provider>
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
/**
 * True while this primary group is focused or still mounted in the pager window.
 * Describes retained UI only. Use usePrimaryPageActive to gate live reads.
 */
export function usePrimaryPageAlive(group: PrimaryPageGroup): boolean {
  const isFocused = useIsFocused();
  const retainedGroups = useContext(RetainedGroupsContext);
  return isFocused || (retainedGroups?.has(group) ?? false);
}

/** Live reads belong to the selected group; retained pages keep their last paint. */
export function usePrimaryPageActive(group: PrimaryPageGroup): boolean {
  const isFocused = useIsFocused();
  const navigation = usePrimaryPageNavigation();
  return (
    isFocused &&
    (!navigation || primaryPageFromRouteName(navigation.activeRouteName)?.group === group)
  );
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
