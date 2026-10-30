import {
  PrimaryPrivacyScopeStoreProvider,
  PrivacyScopeProvider,
} from '@/src/contexts/PrivacyScope';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { AccountsGroupProvider } from '@/src/features/accounts';
import { PrimaryTabBar } from './PrimaryTabBar';
import type { ContextualAddAction } from './ContextualAddMenu';
import type { PrimaryPagerPage, PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import { usePrimaryNavigation } from '@/src/navigation/primaryNavigation';
import {
  PRIMARY_PAGES,
  primaryPageIndex,
  primaryPageFromRouteName,
  rememberPrimaryGroupRoute,
} from '@/src/navigation/primaryPages';
import { PrimaryPageNavigationProvider } from '@/src/navigation/primaryPageNavigation';
import { RemountOnWorkplace } from '@/src/navigation/RemountOnWorkplace';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import type { NavigatorContentProps } from 'expo-router';
import { unstable_useReconcileTabHistory, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { ComponentType } from 'react';
import {
  PersistentTabChromeProvider,
  PersistentTabLeaf,
} from '@/src/components/layout/PersistentTabChrome';
import { SafeAreaFrame } from '@/src/design-system/SafeArea';
import { HomeV2Header } from './HomeV2Header';
import { usePrimaryPageTransitions } from './usePrimaryPageTransitions';

type PrimaryPageOptions = { title?: string };
type PrimaryPageEvents = {
  tabPress: { data: undefined; canPreventDefault: true };
  tabLongPress: { data: undefined; canPreventDefault: false };
};
export type PrimaryPageNavigatorProps = NavigatorContentProps<
  PrimaryPageOptions,
  PrimaryPageEvents,
  { onAddAction: (action: ContextualAddAction) => void }
>;

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
  return (
    <PersistentTabLeaf routeName={routeName}>
      <PrivacyScopeProvider scopeKey={page.group}>{descriptor?.render()}</PrivacyScopeProvider>
    </PersistentTabLeaf>
  );
}

export function createPrimaryPagerContent(
  Viewport: ComponentType<PrimaryPagerViewportProps>,
): ComponentType<PrimaryPageNavigatorProps> {
  return function PrimaryPagerContent({
    state,
    descriptors,
    actions,
    emitter,
    onAddAction,
  }: PrimaryPageNavigatorProps) {
    unstable_useReconcileTabHistory();
    const workplace = useWorkplace();
    const primaryNavigation = usePrimaryNavigation();
    const reportActiveRoute = primaryNavigation?.reportActiveRoute;
    const isFocused = useIsFocused();
    const { isAppCurrentlyLocked } = useAppLock();
    const { isKeyboardVisible } = useKeyboard();
    const reduceMotion = useReducedMotion();
    const [isScreenReaderEnabled, setScreenReaderEnabled] = useState(false);
    const [isAppActive, setAppActive] = useState(AppState.currentState === 'active');
    const activeRouteName = state.routes[state.index]?.name ?? 'index';
    const routeNames = useMemo(() => state.routes.map(route => route.name), [state.routes]);
    const {
      isTransitioning,
      settledReadRoute,
      reportTransitioning,
      navigateToPage,
      onUserPageSelected,
    } = usePrimaryPageTransitions({
      activeRouteName,
      routeNames,
      actions,
      isSwitchingWorkplace: workplace.isSwitchingWorkplace,
      isFocused,
      isAppActive,
      isAppCurrentlyLocked,
    });
    const swipeIndex = Math.max(0, primaryPageIndex(activeRouteName));
    const swipePageCount = PRIMARY_PAGES.length;
    const [mountedIndices, setMountedIndices] = useState<ReadonlySet<number>>(
      () => new Set([swipeIndex]),
    );
    const [pageSwipeLocks, setPageSwipeLocks] = useState<ReadonlySet<string>>(() => new Set());
    const pageProgress = useSharedValue(swipeIndex);
    const preparedRoutes = useMemo(() => {
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
      settledReadRoute,
      isFocused,
      isAppActive,
      isAppCurrentlyLocked,
      workplace.isSwitchingWorkplace,
    ]);

    useEffect(() => {
      rememberPrimaryGroupRoute(activeRouteName);
      reportActiveRoute?.(activeRouteName);
    }, [activeRouteName, reportActiveRoute]);

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
        PRIMARY_PAGES.map(page => ({
          name: page.routeName,
          render: () => renderLeafPage(page.routeName, descriptors, state.routes),
        })),
      [descriptors, state.routes],
    );

    const scrollEnabled =
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
      reduceMotion,
      scrollEnabled,
      pageProgress,
      onPageSelected: onUserPageSelected,
      onTransitioningChange: reportTransitioning,
    };

    return (
      <View style={styles.container}>
        <PrimaryPageNavigationProvider
          liveRouteName={settledReadRoute}
          preparedRoutes={preparedRoutes}
          value={{
            activeRouteName,
            isTransitioning,
            scrollEnabled,
            pageProgress,
            navigateToPage,
            setPageSwipeLock,
          }}
        >
          <RemountOnWorkplace>
            <AccountsGroupProvider
              active={preparedRoutes.has('accounts') || preparedRoutes.has('categories')}
            >
              <PrimaryPrivacyScopeStoreProvider>
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
              </PrimaryPrivacyScopeStoreProvider>
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
            pageProgress={pageProgress}
            onAddAction={onAddAction}
          />
        </PrimaryPageNavigationProvider>
      </View>
    );
  };
}

const styles = StyleSheet.create({ container: { flex: 1 } });
