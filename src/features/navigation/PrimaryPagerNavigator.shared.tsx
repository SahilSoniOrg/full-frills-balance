import {
  PrimaryPrivacyScopeStoreProvider,
  PrivacyScopeProvider,
} from '@/src/contexts/PrivacyScope';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { AccountsGroupPager, AccountsGroupProvider } from '@/src/features/accounts';
import { CommitmentsGroupPager, CommitmentsGroupProvider } from '@/src/features/commitments';
import { PrimaryTabBar } from './PrimaryTabBar';
import type { ContextualAddAction } from './ContextualAddMenu';
import type { PrimaryPagerPage, PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import { usePrimaryNavigation } from '@/src/navigation/primaryNavigation';
import {
  PRIMARY_GROUP_DEFAULT_ROUTE,
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
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useKeyboard } from '@/src/design-system/Keyboard';
import type { NavigatorContentProps } from 'expo-router';
import { unstable_useReconcileTabHistory, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';
import type { ComponentType } from 'react';

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

function renderGroupPage(
  group: PrimaryPageGroup,
  descriptors: PrimaryPageNavigatorProps['descriptors'],
  routes: PrimaryPageNavigatorProps['state']['routes'],
) {
  if (group === 'accounts') {
    return (
      <PrivacyScopeProvider scopeKey="accounts">
        <AccountsGroupPager />
      </PrivacyScopeProvider>
    );
  }
  if (group === 'commitments') {
    return (
      <PrivacyScopeProvider scopeKey="commitments">
        <CommitmentsGroupPager />
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

export function createPrimaryPagerContent(
  PrimaryPagerViewport: ComponentType<PrimaryPagerViewportProps>,
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
    const isFocused = useIsFocused();
    const { isAppCurrentlyLocked } = useAppLock();
    const { isKeyboardVisible } = useKeyboard();
    const [isScreenReaderEnabled, setScreenReaderEnabled] = useState(false);
    const [isAppActive, setAppActive] = useState(AppState.currentState === 'active');
    const [isTransitioning, setTransitioning] = useState(false);
    const activeRouteName = state.routes[state.index]?.name ?? 'index';
    const activePage = primaryPageFromRouteName(activeRouteName);
    const swipeIndex = primarySwipeIndex(activeRouteName);
    const swipePageCount = PRIMARY_SWIPE_GROUPS.length;
    const [mountedIndices, setMountedIndices] = useState<ReadonlySet<number>>(
      () => new Set([swipeIndex]),
    );
    const [pageSwipeLocks, setPageSwipeLocks] = useState<ReadonlySet<string>>(() => new Set());
    const pageProgress = useSharedValue(swipeIndex);
    const routeNames = useMemo(() => state.routes.map(route => route.name), [state.routes]);

    useEffect(() => {
      rememberPrimaryGroupRoute(activeRouteName);
      primaryNavigation?.reportActiveRoute?.(activeRouteName);
    }, [activeRouteName, primaryNavigation?.reportActiveRoute]);

    useEffect(() => {
      setMountedIndices(previous => {
        const next = new Set(previous);
        for (let offset = -2; offset <= 2; offset += 1) {
          const index = swipeIndex + offset;
          if (index >= 0 && index < swipePageCount) next.add(index);
        }
        return next;
      });
    }, [swipeIndex, swipePageCount]);

    useEffect(() => {
      if (isTransitioning) return;
      setMountedIndices(() => {
        const next = new Set<number>();
        for (let offset = -2; offset <= 2; offset += 1) {
          const index = swipeIndex + offset;
          if (index >= 0 && index < swipePageCount) next.add(index);
        }
        return next;
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
        if (routeName === activeRouteName) return;
        // Only lock the outer strip when the group page itself changes.
        if (primarySwipeIndex(routeName) !== primarySwipeIndex(activeRouteName)) {
          setTransitioning(true);
        }
        actions.navigate(routeName);
      },
      [actions, activeRouteName, routeNames],
    );

    const onUserPageSelected = useCallback(
      (index: number) => {
        const group = primarySwipeGroupForIndex(index);
        if (!group) return;
        const fromIndex = primarySwipeIndex(activeRouteName);
        // Enter from the side you swiped from; bottom tab keeps remembered leaf.
        const fromDirection = index >= fromIndex ? 'next' : 'prev';
        const routeName = primaryEntryRouteForGroup(group, fromDirection);
        if (!routeNames.includes(routeName)) return;
        actions.navigate(routeName);
      },
      [actions, activeRouteName, routeNames],
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
    const reportPageGesture = useCallback(
      (gesture: GestureType | null) => primaryNavigation?.reportPageGesture?.(gesture),
      [primaryNavigation?.reportPageGesture],
    );

    const pages = useMemo<PrimaryPagerPage[]>(
      () =>
        PRIMARY_SWIPE_GROUPS.map(group => ({
          key: group,
          name: group,
          render: () => renderGroupPage(group, descriptors, state.routes),
        })),
      [descriptors, state.routes],
    );

    const keptAliveGroups = useMemo(() => {
      const groups = new Set<PrimaryPageGroup>();
      for (const index of mountedIndices) {
        const group = primarySwipeGroupForIndex(index);
        if (group) groups.add(group);
      }
      const activeGroup = primarySwipeGroupForIndex(swipeIndex);
      if (activeGroup) groups.add(activeGroup);
      return groups;
    }, [mountedIndices, swipeIndex]);

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
      isTransitioning,
      scrollEnabled,
      pageProgress,
      onPageSelected: onUserPageSelected,
      onTransitioningChange: setTransitioning,
      onPageGestureReady: reportPageGesture,
    };

    return (
      <View style={styles.container}>
        <PrimaryPageNavigationProvider
          value={{
            activeRouteName,
            isTransitioning,
            pageProgress,
            keptAliveGroups,
            navigateToPage,
            setPageSwipeLock,
          }}
        >
          <RemountOnWorkplace>
            <AccountsGroupProvider active={activePage?.group === 'accounts'}>
              <CommitmentsGroupProvider>
                <PrimaryPrivacyScopeStoreProvider>
                  <PrimaryPagerViewport {...viewportProps} />
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
            onAddAction={onAddAction}
          />
        </PrimaryPageNavigationProvider>
      </View>
    );
  };
}

const styles = StyleSheet.create({ container: { flex: 1 } });
