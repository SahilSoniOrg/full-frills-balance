import {
  PrimaryPrivacyScopeStoreProvider,
  PrivacyScopeProvider,
} from '@/src/contexts/PrivacyScope';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import {
  AccountsGroupPager,
  AccountsGroupProvider,
  AccountsPagerLeaf,
} from '@/src/features/accounts';
import {
  CommitmentsGroupPager,
  CommitmentsGroupProvider,
  CommitmentsPagerLeaf,
} from '@/src/features/commitments';
import { PrimaryTabBar } from './PrimaryTabBar';
import type { ContextualAddAction } from './ContextualAddMenu';
import type { PrimaryPagerPage, PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import { usePrimaryNavigation } from '@/src/navigation/primaryNavigation';
import {
  PRIMARY_GROUP_DEFAULT_ROUTE,
  PRIMARY_PAGES,
  primaryPageIndex,
  PRIMARY_SWIPE_GROUPS,
  primaryEntryRouteForGroup,
  primaryPageFromRouteName,
  primarySwipeGroupForIndex,
  primarySwipeIndex,
  rememberPrimaryGroupRoute,
  type PrimaryPageGroup,
} from '@/src/navigation/primaryPages';
import { PrimaryPageNavigationProvider } from '@/src/navigation/primaryPageNavigation';
import { RemountOnWorkplace } from '@/src/navigation/RemountOnWorkplace';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import type { NavigatorContentProps } from 'expo-router';
import { unstable_useReconcileTabHistory, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { ComponentType } from 'react';
import {
  PersistentTabChromeProvider,
  PersistentTabLeaf,
} from '@/src/components/layout/PersistentTabChrome';
import { SafeAreaFrame } from '@/src/design-system/SafeArea';
import { HomeV2Header } from './HomeV2Header';

type PrimaryPageOptions = { title?: string };
type PrimaryPageEvents = {
  tabPress: { data: undefined; canPreventDefault: true };
  tabLongPress: { data: undefined; canPreventDefault: false };
};
export type PrimaryPageNavigatorProps = NavigatorContentProps<
  PrimaryPageOptions,
  PrimaryPageEvents,
  { onAddAction: (action: ContextualAddAction) => void; homeV2?: boolean }
>;

function renderGroupPage(
  group: PrimaryPageGroup,
  descriptors: PrimaryPageNavigatorProps['descriptors'],
  routes: PrimaryPageNavigatorProps['state']['routes'],
) {
  if (group === 'accounts') {
    return (
      <PrivacyScopeProvider scopeKey="accounts">
        <AccountsGroupPager tapOnly />
      </PrivacyScopeProvider>
    );
  }
  if (group === 'commitments') {
    return (
      <PrivacyScopeProvider scopeKey="commitments">
        <CommitmentsGroupPager tapOnly />
      </PrivacyScopeProvider>
    );
  }

  const routeName = PRIMARY_GROUP_DEFAULT_ROUTE[group];
  const route = routes.find(item => item.name === routeName);
  const descriptor = route
    ? (descriptors[route.key] ?? descriptors[route.name])
    : descriptors[routeName];
  const page = primaryPageFromRouteName(routeName);
  if (!page || !descriptor) return null;
  return <PrivacyScopeProvider scopeKey={page.group}>{descriptor.render()}</PrivacyScopeProvider>;
}

function renderLeafPage(
  routeName: string,
  descriptors: PrimaryPageNavigatorProps['descriptors'],
  routes: PrimaryPageNavigatorProps['state']['routes'],
) {
  const page = primaryPageFromRouteName(routeName);
  if (!page) return null;
  const route = routes.find(item => item.name === routeName);
  const descriptor = route
    ? (descriptors[route.key] ?? descriptors[route.name])
    : descriptors[routeName];
  const content =
    routeName === 'accounts' || routeName === 'categories' ? (
      <AccountsPagerLeaf tab={routeName} />
    ) : routeName === 'commitments' || routeName === 'planned-payments' ? (
      <CommitmentsPagerLeaf tab={routeName === 'commitments' ? 'budgets' : 'planned'} />
    ) : (
      descriptor?.render()
    );
  return (
    <PersistentTabLeaf routeName={routeName}>
      <PrivacyScopeProvider scopeKey={page.group}>{content}</PrivacyScopeProvider>
    </PersistentTabLeaf>
  );
}

export function createPrimaryPagerContent(
  PrimaryPagerViewport: ComponentType<PrimaryPagerViewportProps>,
  HomeV2Viewport: ComponentType<PrimaryPagerViewportProps> = PrimaryPagerViewport,
): ComponentType<PrimaryPageNavigatorProps> {
  function PrimaryPagerContent({
    state,
    descriptors,
    actions,
    emitter,
    onAddAction,
    homeV2 = false,
  }: PrimaryPageNavigatorProps) {
    unstable_useReconcileTabHistory();
    const workplace = useWorkplace();
    const primaryNavigation = usePrimaryNavigation();
    const isFocused = useIsFocused();
    const { isAppCurrentlyLocked } = useAppLock();
    const { isKeyboardVisible } = useKeyboard();
    const reduceMotion = useReducedMotion();
    const [isScreenReaderEnabled, setScreenReaderEnabled] = useState(false);
    const [isAppActive, setAppActive] = useState(AppState.currentState === 'active');
    const [isTransitioning, setTransitioning] = useState(false);
    const activeRouteName = state.routes[state.index]?.name ?? 'index';
    const [settledReadRoute, setSettledReadRoute] = useState(activeRouteName);
    const activePage = primaryPageFromRouteName(activeRouteName);
    const transitioningRef = useRef(false);
    const reportTransitioning = useCallback((moving: boolean) => {
      transitioningRef.current = moving;
      setTransitioning(moving);
    }, []);
    useEffect(() => {
      if (!isTransitioning) setSettledReadRoute(activeRouteName);
    }, [isTransitioning, activeRouteName]);
    const swipeIndex = homeV2
      ? Math.max(0, primaryPageIndex(activeRouteName))
      : primarySwipeIndex(activeRouteName);
    const swipePageCount = homeV2 ? PRIMARY_PAGES.length : PRIMARY_SWIPE_GROUPS.length;
    const Viewport = homeV2 ? HomeV2Viewport : PrimaryPagerViewport;
    const queuedRoute = useRef<string | null>(null);
    const [mountedIndices, setMountedIndices] = useState<ReadonlySet<number>>(
      () => new Set([swipeIndex]),
    );
    const [pageSwipeLocks, setPageSwipeLocks] = useState<ReadonlySet<string>>(() => new Set());
    const pageProgress = useSharedValue(swipeIndex);
    const preparedRoutes = useMemo(() => {
      if (!homeV2) return undefined;
      const routes = new Set<string>();
      if (!isFocused || !isAppActive || isAppCurrentlyLocked || workplace.isSwitchingWorkplace)
        return routes;
      const center = primaryPageIndex(settledReadRoute);
      for (let offset = -1; offset <= 1; offset += 1) {
        const page = PRIMARY_PAGES[center + offset];
        if (page) routes.add(page.routeName);
      }
      return routes;
    }, [
      homeV2,
      settledReadRoute,
      isFocused,
      isAppActive,
      isAppCurrentlyLocked,
      workplace.isSwitchingWorkplace,
    ]);
    const routeNames = useMemo(() => state.routes.map(route => route.name), [state.routes]);

    useEffect(() => {
      rememberPrimaryGroupRoute(activeRouteName);
      primaryNavigation?.reportActiveRoute?.(activeRouteName);
    }, [activeRouteName, primaryNavigation?.reportActiveRoute]);

    useEffect(() => {
      // Never mount speculative neighbors while the native pager is moving.
      if (isTransitioning) return;
      return runAfterInteractions(() => {
        setMountedIndices(previous => {
          // Retain visited neighbors: eviction rebuilt observers and lists on every return.
          const next = new Set(previous);
          for (let offset = -1; offset <= 1; offset += 1) {
            const index = swipeIndex + offset;
            if (index >= 0 && index < swipePageCount) next.add(index);
          }
          return next.size === previous.size && [...next].every(index => previous.has(index))
            ? previous
            : next;
        });
      });
    }, [isTransitioning, swipeIndex, swipePageCount]);

    useEffect(() => {
      let mounted = true;
      void AccessibilityInfo.isScreenReaderEnabled().then(enabled => {
        if (mounted) setScreenReaderEnabled(enabled);
      });
      const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', enabled => {
        setScreenReaderEnabled(enabled);
      });
      return () => {
        mounted = false;
        subscription.remove();
      };
    }, []);

    useEffect(() => {
      const subscription = AppState.addEventListener('change', nextState => {
        setAppActive(nextState === 'active');
      });
      return () => subscription.remove();
    }, []);

    useEffect(() => {
      if (Platform.OS === 'web' || !isFocused) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (primaryNavigation?.drawerVisible) return false;
        if (swipeIndex === 0) return false;
        actions.navigate('index');
        return true;
      });
      return () => subscription.remove();
    }, [actions, isFocused, primaryNavigation?.drawerVisible, swipeIndex]);

    const setPageSwipeLock = useCallback((lockId: string, locked: boolean) => {
      setPageSwipeLocks(previous => {
        if (previous.has(lockId) === locked) return previous;
        const next = new Set(previous);
        if (locked) next.add(lockId);
        else next.delete(lockId);
        return next;
      });
    }, []);

    const navigateToPage = useCallback(
      (routeName: string) => {
        if (!primaryPageFromRouteName(routeName) || !routeNames.includes(routeName)) return;
        if (homeV2 && transitioningRef.current) {
          queuedRoute.current = routeName;
          return;
        }
        if (routeName === activeRouteName) return;
        // Classic tab changes have no pager transition to wait for.
        if (Platform.OS !== 'web' && homeV2) {
          reportTransitioning(true);
        }
        actions.navigate(routeName);
      },
      [actions, activeRouteName, routeNames, homeV2, reportTransitioning],
    );

    useEffect(() => {
      if (workplace.isSwitchingWorkplace || !isFocused || !isAppActive || isAppCurrentlyLocked) {
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
      workplace.isSwitchingWorkplace,
      isFocused,
      isAppActive,
      isAppCurrentlyLocked,
    ]);

    const onUserPageSelected = useCallback(
      (index: number) => {
        if (homeV2) {
          const routeName = PRIMARY_PAGES[index]?.routeName;
          if (routeName && routeNames.includes(routeName)) actions.navigate(routeName);
          return;
        }
        const group = primarySwipeGroupForIndex(index);
        if (!group) return;
        const fromIndex = primarySwipeIndex(activeRouteName);
        // Enter from the side you swiped from; bottom tab keeps remembered leaf.
        const fromDirection = index >= fromIndex ? 'next' : 'prev';
        const routeName = primaryEntryRouteForGroup(group, fromDirection);
        if (!routeNames.includes(routeName)) return;
        actions.navigate(routeName);
      },
      [actions, activeRouteName, routeNames, homeV2],
    );

    const emitTabPress = useCallback(
      (routeKey: string) =>
        emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true })
          .defaultPrevented,
      [emitter],
    );
    const emitTabLongPress = useCallback(
      (routeKey: string) => {
        emitter.emit({ type: 'tabLongPress', target: routeKey });
      },
      [emitter],
    );
    const pages = useMemo<PrimaryPagerPage[]>(
      () =>
        homeV2
          ? PRIMARY_PAGES.map(page => ({
              key: page.id,
              name: page.routeName,
              render: () => renderLeafPage(page.routeName, descriptors, state.routes),
            }))
          : PRIMARY_SWIPE_GROUPS.map(group => ({
              key: group,
              name: group,
              render: () => renderGroupPage(group, descriptors, state.routes),
            })),
      [descriptors, state.routes, homeV2],
    );

    const keptAliveGroups = useMemo(() => {
      const groups = new Set<PrimaryPageGroup>();
      for (const index of mountedIndices) {
        const group = homeV2 ? PRIMARY_PAGES[index]?.group : primarySwipeGroupForIndex(index);
        if (group) groups.add(group);
      }
      const activeGroup = homeV2
        ? PRIMARY_PAGES[swipeIndex]?.group
        : primarySwipeGroupForIndex(swipeIndex);
      if (activeGroup) groups.add(activeGroup);
      return groups;
    }, [mountedIndices, swipeIndex, homeV2]);

    const scrollEnabled =
      homeV2 &&
      Platform.OS !== 'web' &&
      isFocused &&
      isAppActive &&
      !isKeyboardVisible &&
      !isAppCurrentlyLocked &&
      !isScreenReaderEnabled &&
      !workplace.isSwitchingWorkplace &&
      !primaryNavigation?.selectionModeActive &&
      !primaryNavigation?.drawerVisible &&
      pageSwipeLocks.size === 0;

    const viewportProps: PrimaryPagerViewportProps = {
      pages,
      committedIndex: swipeIndex,
      mountedIndices,
      isTransitioning,
      reduceMotion,
      scrollEnabled,
      pageProgress,
      onPageSelected: onUserPageSelected,
      onTransitioningChange: reportTransitioning,
      onLeadingOverscrollOpen: homeV2 ? undefined : primaryNavigation?.openDrawer,
    };

    return (
      <View style={styles.container}>
        <PrimaryPageNavigationProvider
          liveRouteName={homeV2 ? settledReadRoute : undefined}
          preparedRoutes={preparedRoutes}
          value={{
            activeRouteName,
            isTransitioning,
            scrollEnabled,
            pageProgress,
            keptAliveGroups,
            navigateToPage,
            setPageSwipeLock,
          }}
        >
          <RemountOnWorkplace>
            <AccountsGroupProvider
              active={
                preparedRoutes
                  ? preparedRoutes.has('accounts') || preparedRoutes.has('categories')
                  : activePage?.group === 'accounts'
              }
            >
              <CommitmentsGroupProvider>
                <PrimaryPrivacyScopeStoreProvider>
                  {homeV2 ? (
                    <PersistentTabChromeProvider>
                      <SafeAreaFrame edges={['top', 'left', 'right']} style={styles.container}>
                        <HomeV2Header
                          activeRouteName={activeRouteName}
                          pageProgress={pageProgress}
                          onNavigate={navigateToPage}
                          isTransitioning={isTransitioning}
                        />
                        <Viewport {...viewportProps} />
                      </SafeAreaFrame>
                    </PersistentTabChromeProvider>
                  ) : (
                    <Viewport {...viewportProps} />
                  )}
                </PrimaryPrivacyScopeStoreProvider>
              </CommitmentsGroupProvider>
            </AccountsGroupProvider>
          </RemountOnWorkplace>
          <PrimaryTabBar
            routes={state.routes}
            activeRouteName={activeRouteName}
            emitTabPress={emitTabPress}
            emitTabLongPress={emitTabLongPress}
            onNavigateToPage={navigateToPage}
            isSwitching={workplace.isSwitchingWorkplace}
            isTransitioning={isTransitioning}
            allowTransitionNavigation={homeV2}
            pageProgress={homeV2 ? pageProgress : undefined}
            onAddAction={onAddAction}
          />
        </PrimaryPageNavigationProvider>
      </View>
    );
  }
  // Reset mode-specific retained indices and gesture state while keeping the
  // router outside this boundary, so the selected canonical route survives.
  return function VersionedPrimaryPagerContent(props: PrimaryPageNavigatorProps) {
    return <PrimaryPagerContent key={props.homeV2 ? 'v2' : 'v1'} {...props} />;
  };
}

const styles = StyleSheet.create({ container: { flex: 1 } });
